// ==================== JWT Token 工具模块 ====================
// 职责：提供 JWT Token 的生成、验证和提取功能
// 从 process.env 读取密钥和过期时间，不依赖任何 JSON 配置文件

const jwt = require("jsonwebtoken");

// ==================== 模块级常量 ====================
// JWT 密钥和过期时间从环境变量获取，确保敏感信息不硬编码
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d"; // 默认 7 天过期

// ==================== 导出函数 ====================

/**
 * 生成 JWT Token
 * @param {Object} payload - Token 负载数据，如 { userId: 1001 }
 * @returns {{ code: number, token?: string, message?: string }}
 *   - code 200: 生成成功，token 为 JWT 字符串
 *   - code 500: 生成失败，message 包含错误信息
 */
function generateToken(payload) {
  console.log("[jwt][generateToken] 开始生成 Token，payload: " + JSON.stringify(payload));

  // 检查 JWT_SECRET 是否已配置
  if (!JWT_SECRET || JWT_SECRET === "your-jwt-secret-change-in-production") {
    console.error("[jwt][generateToken] JWT_SECRET 未配置或仍为默认值，拒绝生成 Token。");
    return {
      code: 500,
      message: "JWT 密钥未配置，请联系管理员设置 JWT_SECRET 环境变量。",
    };
  }

  try {
    // 使用 jsonwebtoken 的 sign 方法生成 Token
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN, // Token 有效期，如 "7d"
    });
    console.log("[jwt][generateToken] Token 生成成功，过期时间: " + JWT_EXPIRES_IN);
    return { code: 200, token: token };
  } catch (error) {
    console.error("[jwt][generateToken] Token 生成失败: " + error.message);
    return {
      code: 500,
      message: "Token 生成异常: " + error.message,
    };
  }
}

/**
 * 验证并解析 JWT Token
 * @param {string} token - JWT Token 字符串
 * @returns {{ code: number, userId?: string, message?: string }}
 *   - code 200: Token 有效，userId 为 Token 中的主题
 *   - code 401: Token 无效或已过期
 */
function verifyToken(token) {
  console.log("[jwt][verifyToken] 开始验证 Token...");

  // 检查 JWT_SECRET 是否已配置
  if (!JWT_SECRET || JWT_SECRET === "your-jwt-secret-change-in-production") {
    console.error("[jwt][verifyToken] JWT_SECRET 未配置或仍为默认值。");
    return {
      code: 401,
      message: "JWT 密钥未配置，无法验证 Token。",
    };
  }

  try {
    // 验证 Token 并解码
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("[jwt][verifyToken] Token 验证成功，userId: " + JSON.stringify(decoded));
    return { code: 200, userId: decoded.userId };
  } catch (error) {
    // 区分 Token 过期和无效两种情况
    if (error instanceof jwt.TokenExpiredError) {
      console.log("[jwt][verifyToken] Token 已过期。");
      return { code: 401, message: "Token 已过期，请重新登录。" };
    }
    console.error("[jwt][verifyToken] Token 无效: " + error.message);
    return { code: 401, message: "Token 无效，请重新登录。" };
  }
}

/**
 * 从 Express 请求头中提取 Bearer Token
 * @param {import('express').Request} req - Express 请求对象
 * @returns {{ code: number, token?: string, message?: string }}
 *   - code 200: 成功提取，token 为 Bearer Token 字符串
 *   - code 401: 请求头缺失或格式不正确
 */
function extractBearer(req) {
  console.log("[jwt][extractBearer] 开始提取 Bearer Token...");

  // 获取 Authorization 请求头
  const authHeader = req.headers.authorization;

  // 检查 Authorization 头是否存在
  if (!authHeader) {
    console.log("[jwt][extractBearer] Authorization 请求头缺失。");
    return {
      code: 401,
      message: "缺少 Authorization 请求头，请先登录。",
    };
  }

  // 检查是否为 Bearer 格式：必须以 "Bearer " 开头
  if (!authHeader.startsWith("Bearer ")) {
    console.log("[jwt][extractBearer] Authorization 请求头格式不正确: " + authHeader);
    return {
      code: 401,
      message: 'Authorization 格式错误，请使用 "Bearer <token>" 格式。',
    };
  }

  // 提取 Token 字符串（去掉 "Bearer " 前缀）
  const token = authHeader.substring(7); // "Bearer " 长度为 7
  if (!token || token.trim() === "") {
    console.log("[jwt][extractBearer] Token 为空。");
    return {
      code: 401,
      message: "Token 不能为空。",
    };
  }

  console.log("[jwt][extractBearer] Bearer Token 提取成功，长度: " + token.length);
  return { code: 200, token: token };
}

// 导出模块函数
module.exports = {
  generateToken,
  verifyToken,
  extractBearer,
};
