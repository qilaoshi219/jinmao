// ==================== 管理员双重鉴权中间件 ====================
// 职责：提供两层管理员安全验证
//   第一层：URL安全后缀校验（防止URL猜测访问）
//   第二层：JWT Token + 管理员角色验证（真正的身份认证）
// 不匹配时返回 404，伪装成路径不存在，不暴露管理员入口

const fs = require("fs");                              // 文件系统操作（读取安全后缀配置）
const path = require("path");                          // 路径工具
const jwtUtil = require("../utils/jwt");               // JWT 工具模块（Token 验证）
const userRepo = require("../utils/repo/user_repo");   // 用户数据仓库（查询角色）

// 日志前缀
const TAG = "[admin_middleware]";

// ==================== 模块级常量 ====================
// 管理员配置文件路径（安全后缀存储在 JSON 文件中，不在 .env 中）
const ADMIN_CONFIG_PATH = path.join(__dirname, "..", "config", "admin_config.json");

/**
 * 读取当前安全后缀配置
 * @returns {string} 安全后缀字符串
 */
function getSecuritySuffix() {
  try {
    // 检查配置文件是否存在
    if (!fs.existsSync(ADMIN_CONFIG_PATH)) {
      console.error(TAG + " ❌ 管理员配置文件不存在: " + ADMIN_CONFIG_PATH);
      return null;
    }
    // 读取并解析 JSON 配置
    const raw = fs.readFileSync(ADMIN_CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);
    // 校验 suffix 字段存在且非空
    if (!config.securitySuffix || typeof config.securitySuffix !== "string" || config.securitySuffix.trim() === "") {
      console.error(TAG + " ❌ 安全后缀配置无效: " + JSON.stringify(config));
      return null;
    }
    return config.securitySuffix.trim();
  } catch (err) {
    console.error(TAG + " ❌ 读取安全后缀配置失败: " + err.message);
    return null;
  }
}

/**
 * 更新安全后缀配置（写入 JSON 文件）
 * @param {string} newSuffix - 新的安全后缀
 * @returns {{ success: boolean, message: string }}
 */
function updateSecuritySuffix(newSuffix) {
  try {
    // 校验新后缀格式
    if (!newSuffix || typeof newSuffix !== "string" || newSuffix.trim() === "") {
      return { success: false, message: "安全后缀不能为空。" };
    }
    // 长度限制：4-32字符
    if (newSuffix.length < 4 || newSuffix.length > 32) {
      return { success: false, message: "安全后缀长度必须在 4-32 字符之间。" };
    }
    // 仅允许字母、数字、下划线
    if (!/^[a-zA-Z0-9_]+$/.test(newSuffix)) {
      return { success: false, message: "安全后缀仅允许字母、数字和下划线。" };
    }

    // 写入 JSON 配置
    const config = { securitySuffix: newSuffix.trim() };
    fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    console.log(TAG + " ✅ 安全后缀已更新为: " + newSuffix);
    return { success: true, message: "安全后缀已更新，请使用新后缀访问管理页面。" };
  } catch (err) {
    console.error(TAG + " ❌ 更新安全后缀失败: " + err.message);
    return { success: false, message: "写入配置文件失败: " + err.message };
  }
}

/**
 * 第一层：URL安全后缀校验中间件
 * 从请求路径中提取 :suffix 参数，与存储的后缀对比
 * 不匹配 → 返回 404（伪装路径不存在）
 * 匹配 → 放行进入下一层验证
 */
function adminSuffixMiddleware(req, res, next) {
  console.log(TAG + " [第一层] URL后缀校验...");

  // 从请求参数获取 suffix（Express 路由参数 :suffix）
  const requestedSuffix = req.params.suffix;

  // 后缀参数缺失
  if (!requestedSuffix) {
    console.log(TAG + " [第一层] 请求缺少后缀参数");
    return res.status(404).json({ code: 404, message: "Not Found" });
  }

  // 读取存储的安全后缀
  const storedSuffix = getSecuritySuffix();
  if (!storedSuffix) {
    console.error(TAG + " [第一层] 无法读取安全后缀配置");
    return res.status(500).json({ code: 500, message: "服务器内部错误" });
  }

  // 对比后缀
  if (requestedSuffix !== storedSuffix) {
    console.log(TAG + " [第一层] 后缀不匹配，拒绝访问（返回404伪装）");
    // 返回 404 而非 403，隐藏管理员入口存在
    return res.status(404).json({ code: 404, message: "Not Found" });
  }

  console.log(TAG + " [第一层] ✅ 后缀验证通过");
  // 将已验证的后缀存入 req 对象，供后续使用
  req.validatedSuffix = requestedSuffix;
  next(); // 放行至第二层
}

/**
 * 第二层：JWT Token + 管理员角色验证中间件
 * 1. 验证 JWT Token 有效性
 * 2. 查询用户角色是否为 'admin'
 * 任一失败 → 返回 401/403
 */
async function adminAuthMiddleware(req, res, next) {
  console.log(TAG + " [第二层] JWT + 角色验证...");

  // ===== 1. 提取并验证 JWT Token =====
  const extractResult = jwtUtil.extractBearer(req);
  if (extractResult.code !== 200) {
    console.log(TAG + " [第二层] Token 提取失败: " + extractResult.message);
    return res.status(401).json({ code: 401, message: extractResult.message });
  }

  const verifyResult = jwtUtil.verifyToken(extractResult.token);
  if (verifyResult.code !== 200) {
    console.log(TAG + " [第二层] Token 验证失败: " + verifyResult.message);
    return res.status(401).json({ code: 401, message: verifyResult.message });
  }

  const userId = verifyResult.userId;
  console.log(TAG + " [第二层] Token 验证通过，userId: " + userId);

  // ===== 2. 查询用户角色 =====
  const userResult = await userRepo.findById(userId);
  if (userResult.code !== 200) {
    console.log(TAG + " [第二层] 查询用户失败: " + userResult.message);
    return res.status(401).json({ code: 401, message: "用户不存在或已被删除。" });
  }

  const user = userResult.user;

  // 检查用户是否被禁用
  if (user.isBanned) {
    console.log(TAG + " [第二层] 用户 " + userId + " 已被禁用");
    return res.status(403).json({ code: 403, message: "该账号已被禁用。" });
  }

  // 检查是否为管理员
  if (user.role !== "admin") {
    console.log(TAG + " [第二层] 用户 " + userId + " 不是管理员（role=" + user.role + "）");
    return res.status(403).json({ code: 403, message: "无权访问，仅限管理员操作。" });
  }

  console.log(TAG + " [第二层] ✅ 管理员验证通过，userId: " + userId);
  // 将 userId 和 user 注入 req 对象
  req.userId = userId;
  req.user = user;
  next(); // 放行至路由处理函数
}

// ==================== 导出函数 ====================
module.exports = {
  getSecuritySuffix,
  updateSecuritySuffix,
  adminSuffixMiddleware,   // 第一层：后缀校验
  adminAuthMiddleware,     // 第二层：JWT + 角色验证
};
