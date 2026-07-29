// ==================== 学习进度路由模块 ====================
// 职责：收发 HTTP 请求/响应，调用 progress_repo 层执行业务逻辑
// 使用 Express Router 管理路由，挂载到 /api/v1 前缀下
// 端点列表：
//   PUT /api/v1/progress           — 保存学习进度（需 Token）
//   GET /api/v1/progress           — 获取学习进度（需 Token，可选 query: courseId）

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例
const progressRepo = require("../utils/repo/progress_repo"); // 学习进度数据访问层
const activityRepo = require("../utils/repo/activity_repo"); // 每日活动记录数据访问层
const { authenticateToken } = require("../middleware/auth"); // JWT 鉴权中间件

// 日志前缀
const TAG = "[API_progress]";

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/progress:
 *   put:
 *     tags: [学习进度]
 *     summary: 保存学习进度
 *     description: 保存或更新当前用户在指定课程-章节的学习页码。同一用户、同一课程、同一章节仅保留一条最新记录。
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [courseId, chapterId, progress]
             properties:
               courseId:
                 type: string
                 description: 课程 ID
               chapterId:
                 type: string
                 description: 章节 ID
               progress:
                 type: integer
                 description: 当前页码（1-based）
               studyDuration:
                 type: integer
                 description: 本次学习时长增量(秒)，可选
 *           example:
 *             courseId: "1"
 *             chapterId: "2"
 *             progress: 5
 *     responses:
 *       200:
 *         description: 保存成功
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
 *                     courseId: { type: string, example: "1" }
 *                     chapterId: { type: string, example: "2" }
 *                     progress: { type: integer, example: 5 }
 *                     updateTime: { type: string, format: date-time, example: "2026-07-24T10:00:00.000Z" }
 *       400:
 *         description: 参数不合法（缺少必填字段或进度值无效）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "缺少必填参数 courseId。" }
 *       401:
 *         description: 未认证 / Token 无效或已过期
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "Token 无效或已过期。" }
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string, example: "保存学习进度时发生数据库异常。" }
 */

/**
 * PUT /api/v1/progress — 保存学习进度
 * 请求体：{ courseId: string, chapterId: string, progress: number }
 * 响应：{ code: 200, data: { id, courseId, chapterId, progress, updateTime } }
 *
 * 使用 upsert 模式：同一用户同一课程同一章节仅保留一条最新记录
 * 鉴权由 authenticateToken 中间件完成
 */
router.put("/progress", authenticateToken, async (req, res) => {
  console.log(TAG + "[PUT /progress] 收到保存学习进度请求，userId: " + req.userId);

  // ========== 参数校验 ==========
  const { courseId, chapterId, progress, studyDuration } = req.body;

  // 缺少必填参数
  if (!courseId) {
    console.log(TAG + "[PUT /progress] 参数校验失败：缺少 courseId");
    return res.status(400).json({ code: 400, message: "缺少必填参数 courseId。" });
  }
  if (!chapterId) {
    console.log(TAG + "[PUT /progress] 参数校验失败：缺少 chapterId");
    return res.status(400).json({ code: 400, message: "缺少必填参数 chapterId。" });
  }
  // progress 必须是大于 0 的整数
  if (typeof progress !== "number" || progress < 1 || !Number.isInteger(progress)) {
    console.log(TAG + "[PUT /progress] 参数校验失败：progress 无效，值为: " + progress);
    return res.status(400).json({ code: 400, message: "progress 必须为正整数。" });
  }
  // studyDuration 如果传入，必须是大于 0 的整数
  if (studyDuration !== undefined && (typeof studyDuration !== "number" || studyDuration < 0 || !Number.isInteger(studyDuration))) {
    console.log(TAG + "[PUT /progress] 参数校验失败：studyDuration 无效，值为: " + studyDuration);
    return res.status(400).json({ code: 400, message: "studyDuration 必须为非负整数。" });
  }

  // ========== 调用 Repository 层保存 ==========
  const result = await progressRepo.upsertProgress(req.userId, courseId, chapterId, progress, studyDuration);

  // 保存成功后记录每日活动（不阻塞响应，失败不影响主流程）
  if (result.code === 200) {
    activityRepo.recordDailyActivity(req.userId).catch((err) => {
      console.error(TAG + "[PUT /progress] 记录每日活动失败（非关键）: " + err.message);
    });
  }

  // 根据业务结果返回对应的 HTTP 状态码
  const statusMap = { 200: 200, 500: 500 };
  const httpStatus = statusMap[result.code] || 500;

  console.log(TAG + "[PUT /progress] 响应: code=" + result.code + "，message=" + (result.message || "ok"));
  return res.status(httpStatus).json(result);
});

/**
 * @openapi
 * /api/v1/progress:
 *   get:
 *     tags: [学习进度]
 *     summary: 获取学习进度
 *     description: |
 *       获取当前用户的学习进度。
 *       - 不带 courseId 参数：返回所有课程的最新学习进度摘要
 *       - 带 courseId 参数：返回指定课程的最新学习进度
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: courseId
 *         schema:
 *           type: string
 *         required: false
 *         description: 课程 ID（可选，不传则返回所有课程进度）
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string, example: "ok" }
 *                 data:
 *                   oneOf:
 *                     - type: object
 *                       properties:
 *                         courseId: { type: string }
 *                         chapterId: { type: string }
 *                         chapterName: { type: string }
 *                         progress: { type: integer }
 *                         totalPages: { type: integer }
 *                         updateTime: { type: string, format: date-time }
 *                     - type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           courseId: { type: string }
 *                           courseName: { type: string }
 *                           chapterId: { type: string }
 *                           chapterName: { type: string }
 *                           progress: { type: integer }
 *                           totalPages: { type: integer }
 *                           updateTime: { type: string, format: date-time }
 *       401:
 *         description: 未认证 / Token 无效或已过期
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "Token 无效或已过期。" }
 *       404:
 *         description: 未找到指定课程的学习记录（仅在指定 courseId 时出现）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string, example: "没有找到该课程的学习记录。" }
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string, example: "查询学习进度时发生数据库异常。" }
 */

/**
 * GET /api/v1/progress — 获取学习进度
 * 需要在请求头携带 Bearer Token
 * Query 参数：
 *   - courseId（可选）：指定课程 ID，不传则返回所有课程进度
 * 响应：
 *   - 指定 courseId → { code: 200, data: { courseId, chapterId, chapterName, progress, totalPages } }
 *   - 不指定 → { code: 200, data: [{ courseId, courseName, chapterId, chapterName, progress, totalPages }] }
 *
 * 鉴权由 authenticateToken 中间件完成
 */
router.get("/progress", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET /progress] 收到获取学习进度请求，userId: " + req.userId + "，courseId: " + (req.query.courseId || "全部"));

  const { courseId } = req.query;

  let result;
  if (courseId) {
    // 指定课程 → 查询单课程进度
    result = await progressRepo.getProgress(req.userId, courseId);
  } else {
    // 不指定课程 → 查询所有课程进度摘要
    result = await progressRepo.getAllProgress(req.userId);
  }

  // 根据业务结果返回对应的 HTTP 状态码
  // getProgress 可能的返回码：200、404、500
  // getAllProgress 可能的返回码：200、500
  const statusMap = { 200: 200, 404: 404, 500: 500 };
  const httpStatus = statusMap[result.code] || 500;

  console.log(TAG + "[GET /progress] 响应: code=" + result.code + "，message=" + (result.message || "ok"));
  return res.status(httpStatus).json(result);
});

// 导出路由实例，供 app.js 挂载
module.exports = router;
