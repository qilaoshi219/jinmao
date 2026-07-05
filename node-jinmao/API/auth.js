// ==================== Auth 路由模块 ====================
// 职责：收发 HTTP 请求/响应，调用 Service 层执行业务逻辑
// 使用 Express Router 管理路由，挂载到 /api/v1 前缀下
// 端点列表：
//   POST /api/v1/smtpcode       — 发送邮箱验证码
//   POST /api/v1/login           — 验证码登录/注册
//   GET  /api/v1/auth/profile   — 获取当前用户信息（需 Token）
//   PUT  /api/v1/auth/profile   — 更新当前用户信息（需 Token + 邮箱验证码）

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例
const authService = require("../service/auth"); // 认证业务逻辑服务
const { authenticateToken } = require("../middleware/auth"); // JWT 鉴权中间件

// 日志前缀
const TAG = "[API_auth]";

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/smtpcode:
 *   post:
 *     tags: [认证]
 *     summary: 发送邮箱验证码
 *     description: 向指定邮箱发送6位数字验证码，有效期10分钟。同一邮箱5分钟内最多发送3次。
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 用户邮箱地址
 *           example:
 *             email: "user@example.com"
 *     responses:
 *       200:
 *         description: 验证码发送成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string, example: "验证码已发送，请查收邮件。" }
 *       400:
 *         description: 邮箱格式不正确
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "邮箱格式不正确，请提供有效的邮箱地址。" }
 *       429:
 *         description: 发送频率超限（5分钟内超过3次）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 429 }
 *                 message: { type: string, example: "验证码发送频率过高，请在5分钟后再试。" }
 *       500:
 *         description: 邮件发送失败
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string, example: "邮件服务配置不完整，请联系管理员。" }
 */

/**
 * POST /api/v1/smtpcode — 发送邮箱验证码
 * 请求体：{ email: string }
 * 响应：{ code: 200, message: "验证码已发送" }
 *
 * 前端只需调此端点，无需关心"注册还是登录"
 * 后台自动处理频率限制和 SMTP 发送
 */
router.post("/smtpcode", async (req, res) => {
  console.log(TAG + "[POST /smtpcode] 收到发送验证码请求");

  // 从请求体中提取邮箱
  const { email } = req.body;

  // 调用 Service 层执行业务逻辑
  const result = await authService.sendCode(email);

  // 根据业务结果返回对应的 HTTP 状态码
  // sendCode 可能的返回码：200、400、429、500
  const statusMap = { 200: 200, 400: 400, 429: 429, 500: 500 };
  const httpStatus = statusMap[result.code] || 500;

  console.log(TAG + "[POST /smtpcode] 响应: code=" + result.code + ", message=" + result.message);
  return res.status(httpStatus).json(result);
});

/**
 * @openapi
 * /api/v1/login:
 *   post:
 *     tags: [认证]
 *     summary: 验证码登录/注册
 *     description: 提交邮箱和验证码，后台自动判断新用户注册或老用户登录，返回JWT Token。
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 用户邮箱地址
 *               code:
 *                 type: string
 *                 pattern: '^\d{6}$'
 *                 description: 6位数字验证码
 *           example:
 *             email: "user@example.com"
 *             code: "123456"
 *     responses:
 *       200:
 *         description: 登录/注册成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string, example: "登录成功" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user_id: { type: string, example: "1001" }
 *                     token: { type: string, example: "eyJhbGciOiJIUzI1NiIs..." }
 *                     is_new_user: { type: boolean, example: false }
 *       400:
 *         description: 参数不合法（邮箱格式错误或验证码格式错误）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "验证码必须为6位数字。" }
 *       401:
 *         description: 验证码无效或已过期
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "验证码无效或已过期，请重新获取验证码。" }
 *       403:
 *         description: 账号已被禁用
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 403 }
 *                 message: { type: string, example: "账号已被禁用。" }
 */

/**
 * POST /api/v1/login — 验证码登录/注册
 * 请求体：{ email: string, code: string }
 * 响应：{ code: 200, data: { user_id, token, is_new_user } }
 *
 * 后台自动判断：
 *   - 用户不存在 → 自动注册 + 登录 → is_new_user = true
 *   - 用户已存在 → 直接登录 → is_new_user = false
 */
router.post("/login", async (req, res) => {
  console.log(TAG + "[POST /login] 收到登录请求");

  // 从请求体中提取邮箱和验证码
  const { email, code } = req.body;

  // 调用 Service 层执行业务逻辑
  const result = await authService.login(email, code);

  // 根据业务结果返回对应的 HTTP 状态码
  // login 可能的返回码：200、400、401、403、500
  const statusMap = { 200: 200, 400: 400, 401: 401, 403: 403, 500: 500 };
  const httpStatus = statusMap[result.code] || 500;

  console.log(TAG + "[POST /login] 响应: code=" + result.code + ", message=" + result.message);
  return res.status(httpStatus).json(result);
});

/**
 * @openapi
 * /api/v1/auth/profile:
 *   get:
 *     tags: [认证]
 *     summary: 获取当前用户信息
 *     description: 通过 JWT Token 获取当前登录用户的个人信息，包括 ID、用户名、昵称、邮箱、手机号、角色和注册时间。
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string, example: "ok" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: "1" }
 *                     username: { type: string, nullable: true, example: "zhangsan" }
 *                     nickname: { type: string, nullable: true, example: "张三" }
 *                     email: { type: string, format: email, example: "zhangsan@example.com" }
 *                     phone: { type: string, nullable: true, example: "13800138000" }
 *                     role: { type: string, example: "user" }
 *                     create_time: { type: string, format: date-time, example: "2026-07-01T08:00:00.000Z" }
 *       401:
 *         description: 未认证 / Token 无效或已过期
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "Token 无效，请重新登录。" }
 *       403:
 *         description: 账号已被禁用
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 403 }
 *                 message: { type: string, example: "账号已被禁用。" }
 *       404:
 *         description: 用户不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string, example: "用户不存在。" }
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string, example: "服务器内部错误，请稍后再试。" }
 */

/**
 * GET /api/v1/auth/profile — 获取当前用户信息
 * 需要在请求头携带 Bearer Token（Authorization: Bearer {token}）
 * 响应：{ code: 200, data: { id, username, nickname, email, phone, role, create_time } }
 *
 * 鉴权由 authenticateToken 中间件完成：
 *   1. 提取并验证 Bearer Token
 *   2. 将 userId 注入 req.userId
 * 业务检查由 service/auth.js.getProfile() 完成：
 *   3. 查询用户是否存在（isDeleted 过滤）
 *   4. 检查用户是否被禁用（isBanned）
 *   5. 返回安全的用户信息（排除 password 等敏感字段）
 */
router.get("/auth/profile", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET /auth/profile] 收到获取用户信息请求，userId: " + req.userId);

  // 调用 Service 层执行业务逻辑
  const result = await authService.getProfile(req.userId);

  // 根据业务结果返回对应的 HTTP 状态码
  // getProfile 可能的返回码：200、403、404、500
  const statusMap = { 200: 200, 403: 403, 404: 404, 500: 500 };
  const httpStatus = statusMap[result.code] || 500;

  console.log(TAG + "[GET /auth/profile] 响应: code=" + result.code + ", message=" + (result.message || "ok"));
  return res.status(httpStatus).json(result);
});

/**
 * @openapi
 * /api/v1/auth/profile:
 *   put:
 *     tags: [认证]
 *     summary: 更新当前用户信息
 *     description: |
 *       通过邮箱验证码验证身份后，更新当前登录用户的个人信息。
 *       可更新昵称（nickname）、手机号（phone）、密码（password），所有更新字段均为可选，但至少需提供一个。
 *       **安全机制**：每次修改都需通过邮箱验证码验证身份，验证码通过 POST /api/v1/smtpcode 获取，有效期 10 分钟，一次性使用。
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               nickname:
 *                 type: string
 *                 maxLength: 50
 *                 description: 新昵称
 *               phone:
 *                 type: string
 *                 pattern: '^1[3-9]\\d{9}$'
 *                 description: 新手机号（11位中国大陆手机号码）
 *               password:
 *                 type: string
 *                 maxLength: 255
 *                 description: 新密码
 *               code:
 *                 type: string
 *                 pattern: '^\\d{6}$'
 *                 description: 邮箱验证码（通过 POST /api/v1/smtpcode 获取，有效期10分钟）
 *           example:
 *             nickname: "张三（新）"
 *             phone: "13900139000"
 *             code: "123456"
 *     responses:
 *       200:
 *         description: 更新成功，返回更新后的用户信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string, example: "个人信息更新成功。" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: "1" }
 *                     username: { type: string, nullable: true, example: "zhangsan" }
 *                     nickname: { type: string, nullable: true, example: "张三（新）" }
 *                     email: { type: string, format: email, example: "zhangsan@example.com" }
 *                     phone: { type: string, nullable: true, example: "13900139000" }
 *                     role: { type: string, example: "user" }
 *                     create_time: { type: string, format: date-time, example: "2026-07-01T08:00:00.000Z" }
 *                     update_time: { type: string, format: date-time, example: "2026-07-05T10:30:00.000Z" }
 *       400:
 *         description: 参数不合法 / 缺少验证码 / 没有提供更新字段 / 手机号格式错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "缺少验证码，请先通过 /api/v1/smtpcode 获取邮箱验证码。" }
 *       401:
 *         description: 验证码无效或已过期 / Token 无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "验证码错误，请重新输入。" }
 *       403:
 *         description: 账号已被禁用
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 403 }
 *                 message: { type: string, example: "账号已被禁用。" }
 *       404:
 *         description: 用户不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string, example: "用户不存在。" }
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string, example: "服务器内部错误，请稍后再试。" }
 */

/**
 * PUT /api/v1/auth/profile — 更新当前用户信息（需邮箱验证码验证身份）
 * 需要在请求头携带 Bearer Token（Authorization: Bearer {token}）
 * 请求体：{ nickname?, phone?, password?, code }
 * 响应：{ code: 200, data: { id, username, nickname, email, phone, role, create_time, update_time } }
 *
 * 鉴权由 authenticateToken 中间件完成：
 *   1. 提取并验证 Bearer Token
 *   2. 将 userId 注入 req.userId
 * 业务检查由 service/auth.js.updateProfile() 完成：
 *   3. 校验输入参数（必填验证码 + 至少一个更新字段）
 *   4. 查询用户是否存在 → 检查 isBanned
 *   5. 验证邮箱验证码（与用户注册邮箱绑定，一次性使用）
 *   6. 更新数据库并返回更新后的用户信息
 */
router.put("/auth/profile", authenticateToken, async (req, res) => {
  console.log(TAG + "[PUT /auth/profile] 收到更新用户信息请求，userId: " + req.userId);

  // 调用 Service 层执行业务逻辑
  const result = await authService.updateProfile(req.userId, req.body);

  // 根据业务结果返回对应的 HTTP 状态码
  // updateProfile 可能的返回码：200、400、401、403、404、500
  const statusMap = { 200: 200, 400: 400, 401: 401, 403: 403, 404: 404, 500: 500 };
  const httpStatus = statusMap[result.code] || 500;

  console.log(TAG + "[PUT /auth/profile] 响应: code=" + result.code + ", message=" + (result.message || "ok"));
  return res.status(httpStatus).json(result);
});

// 导出路由实例，供 app.js 挂载
module.exports = router;
