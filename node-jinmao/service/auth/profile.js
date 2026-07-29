// ==================== 用户资料模块 ====================
// 职责：获取和更新当前登录用户的个人信息
// getProfile：通过 userId 查询并返回安全的用户信息
// updateProfile：邮箱验证码验证身份后更新用户信息（nickname/phone/password）
// 输入校验复用 input_validator.js，验证码校验复用 otp.js.verifyAndConsumeOtp
// 数据库操作委托 user_repo.js

const { validateFields } = require("../../utils/input_validator"); // 统一输入校验
const userRepo = require("../../utils/repo/user_repo"); // 用户 Repository
const { verifyAndConsumeOtp } = require("./otp"); // 验证码校验公共函数

// 日志前缀，统一模块输出风格
const TAG = "[auth_profile]";

/**
 * 获取当前用户的个人信息
 * 通过 userId 查询用户资料，检查账号状态，返回安全的用户信息
 * @param {string} userId - 从 JWT Token 中解析出的用户 ID（字符串类型）
 * @returns {Promise<{ code: number, data?: Object, message?: string }>}
 *   - code 200: 成功获取，data 包含用户信息（id, username, nickname, email, phone, role, create_time）
 *   - code 403: 账号已被禁用
 *   - code 404: 用户不存在（已删除或不存在）
 *   - code 500: 服务器内部错误
 */
async function getProfile(userId) {
  console.log(TAG + "[getProfile] 开始获取用户信息，userId: " + userId);

  // ========== 1. 查询用户 ==========
  // 调用 user_repo.findById 查数据库，会过滤 isDeleted 用户
  const result = await userRepo.findById(userId);

  // 透传错误（404 用户不存在、500 数据库异常）
  if (result.code !== 200) {
    console.log(TAG + "[getProfile] 查询用户失败: code=" + result.code + ", message=" + result.message);
    return result;
  }

  const user = result.user;

  // ========== 2. 检查用户是否被禁用 ==========
  if (user.isBanned) {
    console.log(TAG + "[getProfile] 用户已被禁用，ID: " + user.id + "，原因: " + (user.banReason || "未提供"));
    return {
      code: 403,
      message: "账号已被禁用" + (user.banReason ? "，原因: " + user.banReason : "") + "。",
    };
  }

  // ========== 3. 格式化返回数据（排除敏感字段） ==========
  // 注意：user.id 是 Prisma 的 BigInt 类型，需转为 String 防止 JSON 精度丢失
  const profileData = {
    id: String(user.id),            // BigInt → String
    username: user.username,         // 可能为 null（验证码注册用户无用户名）
    nickname: user.nickname,         // 可能为 null
    email: user.email,               // 一定存在
    phone: user.phone,               // 可能为 null
    role: user.role,                 // 默认 "user"
    vipLevel: user.vipLevel,         // VIP 等级：free / vip1 / vip2 / vip3
    balance: String(user.balance),   // 余额（Decimal → String，精确到小数点后 7 位）
    plan: user.plan,                 // 开通计划：null / "basic" / "pro"
    create_time: user.createTime,    // ISO 时间字符串
  };

  console.log(TAG + "[getProfile] 用户信息获取成功，ID: " + profileData.id + "，邮箱: " + profileData.email);
  console.log(TAG + "[getProfile] 用户名: " + (profileData.username || "(未设置)") + "，昵称: " + (profileData.nickname || "(未设置)") + "，角色: " + profileData.role);

  return {
    code: 200,
    message: "ok",
    data: profileData,
  };
}

/**
 * 更新当前用户的个人信息（需邮箱验证码验证身份）
 * 可更新字段：nickname（昵称）、phone（手机号）、password（密码）
 * 所有字段均为可选，但 code（验证码）为必填，且至少传一个非 code 字段
 * @param {string} userId - 从 JWT Token 中解析出的用户 ID（字符串类型）
 * @param {Object} body - 请求体 { nickname?, phone?, password?, code }
 * @returns {Promise<{ code: number, data?: Object, message?: string }>}
 *   - code 200: 更新成功，data 包含更新后的用户信息
 *   - code 400: 参数不合法 / 没有提供更新字段
 *   - code 401: 验证码无效或已过期
 *   - code 403: 账号已被禁用
 *   - code 404: 用户不存在
 *   - code 500: 服务器内部错误
 */
async function updateProfile(userId, body) {
  console.log(TAG + "[updateProfile] 收到更新用户信息请求，userId: " + userId);

  const { nickname, phone, password, code } = body;

  // ========== 1. 验证码必填校验 ==========
  if (!code) {
    console.log(TAG + "[updateProfile] 缺少验证码");
    return { code: 400, message: "缺少验证码，请先通过 /api/v1/smtpcode 获取邮箱验证码。" };
  }

  // ========== 2. 构建可更新字段列表，检查是否至少有一个更新字段 ==========
  // 可更新的字段白名单，排除 username 和 email
  const updateFields = {};
  if (nickname !== undefined && nickname !== null) updateFields.nickname = nickname;
  if (phone !== undefined && phone !== null) updateFields.phone = phone;
  if (password !== undefined && password !== null) updateFields.password = password;

  // 检查是否有至少一个非 code 的更新字段
  if (Object.keys(updateFields).length === 0) {
    console.log(TAG + "[updateProfile] 没有提供任何更新字段，userId: " + userId);
    return { code: 400, message: "没有提供需要更新的字段，请至少提供 nickname、phone 或 password 中的一个。" };
  }

  // ========== 3. 输入校验（对每个更新字段进行安全检查） ==========
  const fieldsToValidate = {};
  // 动态构建校验配置
  if (updateFields.nickname !== undefined) {
    fieldsToValidate.nickname = {
      value: updateFields.nickname,
      type: "string",
      options: { maxLength: 50, required: true, checkInjection: true, checkDangerousChars: true },
    };
  }
  if (updateFields.phone !== undefined) {
    fieldsToValidate.phone = {
      value: updateFields.phone,
      type: "string",
      options: { maxLength: 20, required: true, checkInjection: true, checkDangerousChars: true },
    };
  }
  if (updateFields.password !== undefined) {
    fieldsToValidate.password = {
      value: updateFields.password,
      type: "string",
      options: { maxLength: 255, required: true, checkInjection: true, checkDangerousChars: true },
    };
  }
  // 验证码也需要校验
  fieldsToValidate.code = {
    value: code,
    type: "string",
    options: { maxLength: 6, required: true, checkInjection: true },
  };

  const validation = validateFields(fieldsToValidate, TAG);
  if (!validation.valid) {
    console.log(TAG + "[updateProfile] 输入校验失败: " + validation.error);
    return { code: 400, message: validation.error };
  }

  // ========== 3.5 手机号格式校验（如果提供了 phone） ==========
  if (updateFields.phone !== undefined && !/^1[3-9]\d{9}$/.test(updateFields.phone)) {
    console.log(TAG + "[updateProfile] 手机号格式不合法: " + updateFields.phone);
    return { code: 400, message: "手机号格式不正确，请输入有效的 11 位中国大陆手机号码。" };
  }

  // ========== 3.6 验证码格式校验：必须是 6 位纯数字 ==========
  if (!/^\d{6}$/.test(code)) {
    console.log(TAG + "[updateProfile] 验证码格式错误: " + code);
    return { code: 401, message: "验证码必须为 6 位数字。" };
  }

  // ========== 4. 查询当前用户信息（获取邮箱） ==========
  const userResult = await userRepo.findById(userId);

  if (userResult.code !== 200) {
    console.log(TAG + "[updateProfile] 查询用户失败: code=" + userResult.code + ", message=" + userResult.message);
    return userResult; // 透传 404 或 500
  }

  const user = userResult.user;

  // ========== 5. 检查用户是否被禁用 ==========
  if (user.isBanned) {
    console.log(TAG + "[updateProfile] 用户已被禁用，ID: " + user.id + "，原因: " + (user.banReason || "未提供"));
    return {
      code: 403,
      message: "账号已被禁用" + (user.banReason ? "，原因: " + user.banReason : "") + "。",
    };
  }

  // ========== 6. 验证并消费邮箱验证码（委托 otp.js 公共函数） ==========
  // 验证码与用户的注册邮箱绑定
  const userEmail = user.email;
  console.log(TAG + "[updateProfile] 开始验证邮箱验证码，邮箱: " + userEmail);

  const otpResult = verifyAndConsumeOtp(userEmail, code);
  if (!otpResult.valid) {
    // 透传 401 错误（验证码不存在/过期/不匹配）
    return { code: otpResult.code, message: otpResult.message };
  }

  // ========== 7. 更新用户信息到数据库 ==========
  console.log(TAG + "[updateProfile] 开始更新数据库，字段: " + Object.keys(updateFields).join(", "));
  const updateResult = await userRepo.updateProfile(userId, updateFields);

  if (updateResult.code !== 200) {
    console.log(TAG + "[updateProfile] 数据库更新失败: code=" + updateResult.code + ", message=" + updateResult.message);
    return { code: 500, message: "用户信息更新失败: " + updateResult.message };
  }

  // ========== 8. 格式化返回数据（排除敏感字段） ==========
  const updatedUser = updateResult.user;
  const profileData = {
    id: String(updatedUser.id),               // BigInt → String
    username: updatedUser.username,            // 可能为 null
    nickname: updatedUser.nickname,            // 可能为 null
    email: updatedUser.email,                  // 一定存在
    phone: updatedUser.phone,                  // 可能为 null
    role: updatedUser.role,                    // 默认 "user"
    vipLevel: updatedUser.vipLevel,            // VIP 等级
    balance: String(updatedUser.balance),      // 余额（Decimal → String）
    plan: updatedUser.plan,                    // 开通计划
    create_time: updatedUser.createTime,       // ISO 时间字符串
    update_time: updatedUser.updateTime,       // 更新时间
  };

  console.log(TAG + "[updateProfile] 用户信息更新成功，ID: " + profileData.id + "，邮箱: " + profileData.email);
  console.log(TAG + "[updateProfile] 更新的字段: " + Object.keys(updateFields).join(", "));

  return {
    code: 200,
    message: "个人信息更新成功。",
    data: profileData,
  };
}

// ==================== 导出模块 ====================
module.exports = {
  getProfile,
  updateProfile,
};
