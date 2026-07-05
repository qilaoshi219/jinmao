// ==================== 登录/注册模块 ====================
// 职责：验证码登录/注册，自动判断新用户注册还是老用户登录
// 输入校验复用 input_validator.js，验证码校验复用 otp.js.verifyAndConsumeOtp
// 数据库操作委托 user_repo.js，Token 生成委托 jwt.js

const { validateFields } = require("../../utils/input_validator"); // 统一输入校验
const jwtUtil = require("../../utils/jwt"); // JWT Token 工具
const userRepo = require("../../utils/repo/user_repo"); // 用户 Repository
const { verifyAndConsumeOtp } = require("./otp"); // 验证码校验公共函数

// 日志前缀，统一模块输出风格
const TAG = "[auth_login]";

/**
 * 验证码登录/注册
 * 验证验证码正确性，自动判断新用户注册还是老用户登录
 * @param {string} email - 用户邮箱地址
 * @param {string} code - 6 位验证码
 * @returns {Promise<{ code: number, data?: Object, message?: string }>}
 *   - code 200: 登录/注册成功，data 包含 { user_id, token, is_new_user }
 *   - code 400: 输入参数不合法
 *   - code 401: 验证码无效或已过期
 *   - code 403: 账号已被禁用
 *   - code 500: 服务器内部错误
 */
async function login(email, code) {
  console.log(TAG + "[login] 收到登录请求，邮箱: " + email);
  // 仅开发环境打印验证码明文，生产环境脱敏
  if (process.env.NODE_ENV === "development") {
    console.log(TAG + "[login] 验证码: " + code);
  }

  // ========== 1. 输入校验 ==========
  // 使用 validateFields 批量校验邮箱和验证码
  const validation = validateFields(
    {
      email: {
        value: email,
        type: "string",
        options: { maxLength: 100, required: true, checkInjection: true },
      },
      code: {
        value: code,
        type: "string",
        options: { maxLength: 6, required: true, checkInjection: true },
      },
    },
    TAG
  );

  if (!validation.valid) {
    console.log(TAG + "[login] 输入校验失败: " + validation.error);
    return { code: 400, message: validation.error };
  }

  // ========== 1.5. 邮箱格式正则校验 ==========
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.log(TAG + "[login] 邮箱格式不合法: " + email);
    return { code: 400, message: "邮箱格式不正确，请提供有效的邮箱地址。" };
  }

  // ========== 2. 验证码格式校验：必须是 6 位纯数字 ==========
  if (!/^\d{6}$/.test(code)) {
    console.log(TAG + "[login] 验证码格式错误: " + code);
    return { code: 400, message: "验证码必须为 6 位数字。" };
  }

  // ========== 3. 验证并消费验证码（委托 otp.js 公共函数） ==========
  const otpResult = verifyAndConsumeOtp(email, code);
  if (!otpResult.valid) {
    // 透传 401 错误（验证码不存在/过期/不匹配）
    return { code: otpResult.code, message: otpResult.message };
  }

  // ========== 4. 查询数据库：判断新用户还是老用户 ==========
  let isNewUser = false;
  let user;

  // 先查询用户是否存在
  const findResult = await userRepo.findByEmail(email);

  if (findResult.code === 200) {
    // 用户已存在 → 老用户登录
    user = findResult.user;
    isNewUser = false;
    console.log(TAG + "[login] 老用户登录，ID: " + user.id);

    // 检查用户是否被禁用
    if (user.isBanned) {
      console.log(TAG + "[login] 用户已被禁用，ID: " + user.id + "，原因: " + (user.banReason || "未提供"));
      return {
        code: 403,
        message: "账号已被禁用" + (user.banReason ? "，原因: " + user.banReason : "") + "。",
      };
    }
  } else if (findResult.code === 404) {
    // 用户不存在 → 新用户注册
    console.log(TAG + "[login] 新用户注册，邮箱: " + email);

    // 创建新用户（仅邮箱，无密码）
    const createResult = await userRepo.createByEmail(email);

    if (createResult.code !== 200) {
      console.error(TAG + "[login] 新用户创建失败: " + createResult.message);
      return { code: 500, message: "用户注册失败: " + createResult.message };
    }

    user = createResult.user;
    isNewUser = true;
    console.log(TAG + "[login] 新用户注册成功，ID: " + user.id);
  } else {
    // 数据库查询异常
    console.error(TAG + "[login] 数据库查询异常: " + findResult.message);
    return { code: 500, message: "服务器内部错误: " + findResult.message };
  }

  // ========== 5. 生成 JWT Token ==========
  // 注意：user.id 是 Prisma 返回的 BigInt 类型，JSON.stringify 无法序列化
  // 必须转为 String 再放入 JWT payload，避免 "Do not know how to serialize a BigInt" 错误
  const userId = String(user.id); // BigInt → String
  const tokenResult = jwtUtil.generateToken({ userId: userId });

  if (tokenResult.code !== 200) {
    console.error(TAG + "[login] JWT Token 生成失败: " + tokenResult.message);
    return { code: 500, message: "Token 生成失败: " + tokenResult.message };
  }

  console.log(TAG + "[login] 登录成功，用户ID: " + user.id + "，是否新用户: " + isNewUser);

  // ========== 6. 返回结果 ==========
  return {
    code: 200,
    message: isNewUser ? "注册并登录成功" : "登录成功",
    data: {
      user_id: String(user.id), // BigInt 转 String 防止 JSON 精度丢失
      token: tokenResult.token,
      is_new_user: isNewUser, // 前端可根据此字段展示不同欢迎语
    },
  };
}

// ==================== 导出模块 ====================
module.exports = {
  login,
};
