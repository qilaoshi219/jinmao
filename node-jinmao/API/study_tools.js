// ==================== 学习工具路由模块 ====================
// 职责：学习页辅助工具接口（复习提纲 / 章节测验 / 思维导图）
// 端点列表：
//   POST /api/v1/courses/:courseId/review-outline — 生成复习提纲（需 Token，按 LLM 计费）
//   POST /api/v1/courses/:courseId/chapters/:chapterId/quiz — 生成章节测验（需 Token，按 LLM 计费）
//   GET  /api/v1/courses/:courseId/mindmap — 获取思维导图数据（需 Token，免费）

const express = require("express");
const router = express.Router();
const studyTools = require("../service/study_tools");
const { authenticateToken } = require("../middleware/auth");

// 日志前缀
const TAG = "[API_study_tools]";

/**
 * @openapi
 * /api/v1/courses/{courseId}/review-outline:
 *   post:
 *     tags: [课程学习]
 *     summary: 生成课程复习提纲
 *     description: 按课程各章节原文调用 DeepSeek 生成 Markdown 复习提纲（按经济版 flash 计费）。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *         description: 课程 ID
 *     responses:
 *       200:
 *         description: 生成成功
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
 *                     courseId: { type: string }
 *                     outline: { type: string, description: "Markdown 复习提纲" }
 *       400:
 *         description: 课程无可用章节
 *       401:
 *         description: 未认证
 *       402:
 *         description: 余额不足或已锁定
 *       403:
 *         description: 无权访问该课程
 *       404:
 *         description: 课程不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/courses/:courseId/review-outline", authenticateToken, async (req, res) => {
  console.log(TAG + "[POST review-outline] 收到请求，userId: " + req.userId + "，courseId: " + req.params.courseId);
  try {
    const result = await studyTools.generateReviewOutline(req.userId, req.params.courseId);
    if (result.code === 402) return res.status(402).json(result);
    if (result.code !== 200) {
      const statusMap = { 400: 400, 403: 403, 404: 404 };
      return res.status(statusMap[result.code] || 500).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error(TAG + "[POST review-outline] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "生成复习提纲时发生异常: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/chapters/{chapterId}/quiz:
 *   post:
 *     tags: [课程学习]
 *     summary: 生成章节测验
 *     description: 按章节原文调用 DeepSeek 生成 5 道测验题（单选3/多选1/判断1，按经济版 flash 计费）。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: chapterId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
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
 *                     courseId: { type: string }
 *                     chapterId: { type: string }
 *                     chapterName: { type: string }
 *                     questions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type: { type: string, enum: [SINGLE, MULTIPLE, JUDGE] }
 *                           content: { type: string }
 *                           options: { type: array, items: { type: object } }
 *                           answer: { type: string }
 *                           analysis: { type: string }
 *       400:
 *         description: 章节不属于课程
 *       401:
 *         description: 未认证
 *       402:
 *         description: 余额不足或已锁定
 *       403:
 *         description: 无权访问
 *       404:
 *         description: 课程/章节不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/courses/:courseId/chapters/:chapterId/quiz", authenticateToken, async (req, res) => {
  console.log(TAG + "[POST chapter-quiz] 收到请求，userId: " + req.userId + "，courseId: " + req.params.courseId + "，chapterId: " + req.params.chapterId);
  try {
    const result = await studyTools.generateChapterQuiz(req.userId, req.params.courseId, req.params.chapterId);
    if (result.code === 402) return res.status(402).json(result);
    if (result.code !== 200) {
      const statusMap = { 400: 400, 403: 403, 404: 404 };
      return res.status(statusMap[result.code] || 500).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error(TAG + "[POST chapter-quiz] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "生成章节测验时发生异常: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/mindmap:
 *   get:
 *     tags: [课程学习]
 *     summary: 获取课程思维导图数据
 *     description: 从各章节大纲 JSON 提取课程 → 章节 → 每页要点标题（免费，不消耗 AI）。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
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
 *                   type: object
 *                   properties:
 *                     courseId: { type: string }
 *                     courseName: { type: string }
 *                     chapters:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           chapterId: { type: string }
 *                           sequence: { type: integer }
 *                           name: { type: string }
 *                           totalPages: { type: integer }
 *                           slides:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 page: { type: integer }
 *                                 title: { type: string }
 *       400:
 *         description: 课程无可用章节
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权访问
 *       404:
 *         description: 课程不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/courses/:courseId/mindmap", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET mindmap] 收到请求，userId: " + req.userId + "，courseId: " + req.params.courseId);
  try {
    const result = await studyTools.getCourseMindMap(req.userId, req.params.courseId);
    if (result.code !== 200) {
      const statusMap = { 400: 400, 403: 403, 404: 404 };
      return res.status(statusMap[result.code] || 500).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error(TAG + "[GET mindmap] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "获取思维导图数据时发生异常: " + error.message });
  }
});

module.exports = router;
