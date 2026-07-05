// ==================== JWT 鉴权中间件 ====================
// 职责：验证 HTTP 请求中的 JWT Token 是否合法有效
// 仅负责 Token 解析与格式验证（"你是谁"），不检查用户状态（"你能做什么"）
// 用户状态检查（isBanned/isDeleted）由 Service 层负责，关注点分离

const jwtUtil = require("../utils/jwt"); // JWT 工具模块

// 日志前缀
const TAG = "[auth_middleware]";

/**
 * Express JWT 鉴权中间件
 * 从请求头提取 Bearer Token → 验证 Token → 将 userId 注入 req 对象 → 放行
 * Token 验证失败时直接返回 401 响应
 * @param {import('express').Request} req - Express 请求对象
 * @param {import('express').Response} res - Express 响应对象
 * @param {Function} next - 下一个中间件/路由处理函数
 */
function authenticateToken(req, res, next) {
  console.log(TAG + "[authenticateToken] 开始验证请求 Token...");

  // ========== 1. 从请求头提取 Bearer Token ==========
  const extractResult = jwtUtil.extractBearer(req);

  // Token 提取失败（缺失或格式错误）
  if (extractResult.code !== 200) {
    console.log(TAG + "[authenticateToken] Token 提取失败: " + extractResult.message);
    return res.status(401).json({
      code: 401,
      message: extractResult.message,
    });
  }

  // ========== 2. 验证 Token 有效性 ==========
  const verifyResult = jwtUtil.verifyToken(extractResult.token);

  // Token 无效或已过期
  if (verifyResult.code !== 200) {
    console.log(TAG + "[authenticateToken] Token 验证失败: " + verifyResult.message);
    return res.status(401).json({
      code: 401,
      message: verifyResult.message,
    });
  }

  // ========== 3. Token 验证通过，将 userId 注入 req 对象 ==========
  // 后续的 Service 层可以通过 req.userId 获取当前用户 ID
  req.userId = verifyResult.userId;
  console.log(TAG + "[authenticateToken] Token 验证通过，userId: " + verifyResult.userId);

  // 放行，进入下一个中间件或路由处理函数
  next();
}

// 导出中间件
module.exports = {
  authenticateToken,
};
