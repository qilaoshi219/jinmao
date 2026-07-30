// ==================== 刷题会话路由模块 ====================
// 职责：随机刷题会话的开始、详情、进度保存、交卷
// 端点：/api/v1/quiz/random-*

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../../middleware/auth");
const quizService = require("../../service/quiz_service");

// 日志前缀
const TAG = "[API_quiz_session]";

/**
 * @openapi
 * /api/v1/quiz/random-status:
 *   get:
 *     tags: [刷题]
 *     summary: 批量查询教材随机刷题会话状态
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: textbookIds
 *         in: query
 *         required: true
 *         schema: { type: string }
 *         description: 题库ID，逗号分隔
 *     responses:
 *       200:
 *         description: 查询成功
 */
router.get("/random-status", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /random-status] 收到请求，textbookIds: " + req.query.textbookIds);

  try {
    const textbookIds = (req.query.textbookIds || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (textbookIds.length === 0) {
      return res.status(200).json({ code: 0, message: "查询成功", data: [] });
    }

    const result = await quizService.getRandomSessionStatus(req.userId, textbookIds);

    return res.status(200).json({ code: 0, message: "查询成功", data: result });
  } catch (error) {
    console.error(TAG + " [GET /random-status] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/random-sessions:
 *   post:
 *     tags: [刷题]
 *     summary: 开始或继续随机刷题
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [textbookId]
 *             properties:
 *               textbookId: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 */
router.post("/random-sessions", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /random-sessions] 收到请求，textbookId: " + req.body.textbookId);

  try {
    const { textbookId } = req.body;

    if (!textbookId) {
      return res.status(400).json({ code: 400, message: "题库ID（textbookId）不能为空。", data: null });
    }

    const result = await quizService.startRandomSession(req.userId, textbookId);

    return res.status(200).json({ code: 0, message: "成功", data: result });
  } catch (error) {
    console.error(TAG + " [POST /random-sessions] 异常: " + error.message);

    if (error.message === "TEXTBOOK_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "题库不存在或无权访问。", data: null });
    }
    if (error.message === "NO_QUESTIONS_AVAILABLE") {
      return res.status(400).json({ code: 400, message: "该题库没有题目，请先导入题目。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/random-sessions/{sessionId}:
 *   get:
 *     tags: [刷题]
 *     summary: 获取会话详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 */
router.get("/random-sessions/:sessionId", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /random-sessions/:sessionId] 收到请求，sessionId: " + req.params.sessionId);

  try {
    const result = await quizService.getRandomSessionDetail(req.userId, req.params.sessionId);

    return res.status(200).json({ code: 0, message: "成功", data: result });
  } catch (error) {
    console.error(TAG + " [GET /random-sessions/:sessionId] 异常: " + error.message);

    if (error.message === "SESSION_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "会话不存在或无权访问。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/random-sessions/{sessionId}/progress:
 *   put:
 *     tags: [刷题]
 *     summary: 保存刷题进度和作答
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentQuestionIndex]
 *             properties:
 *               currentQuestionIndex: { type: integer }
 *               questionId: { type: string }
 *               answer: { oneOf: [{ type: string }, { type: array }] }
 *     responses:
 *       200:
 *         description: 保存成功
 */
router.put("/random-sessions/:sessionId/progress", authenticateToken, async (req, res) => {
  console.log(TAG + " [PUT /random-sessions/:sessionId/progress] 收到请求");

  try {
    const result = await quizService.saveRandomSessionProgress(
      req.userId,
      req.params.sessionId,
      {
        currentQuestionIndex: req.body.currentQuestionIndex,
        questionId: req.body.questionId,
        answer: req.body.answer,
      }
    );

    return res.status(200).json({ code: 0, message: "保存成功", data: result });
  } catch (error) {
    console.error(TAG + " [PUT /progress] 异常: " + error.message);

    if (error.message === "SESSION_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "会话不存在。", data: null });
    }
    if (error.message === "SESSION_NOT_ACTIVE") {
      return res.status(400).json({ code: 400, message: "会话已结束，无法保存。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/random-sessions/{sessionId}/complete:
 *   post:
 *     tags: [刷题]
 *     summary: 交卷完成会话
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 交卷成功
 */
router.post("/random-sessions/:sessionId/complete", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /random-sessions/:sessionId/complete] 收到请求");

  try {
    const result = await quizService.completeRandomSession(req.userId, req.params.sessionId);

    return res.status(200).json({ code: 0, message: "交卷成功", data: result });
  } catch (error) {
    console.error(TAG + " [POST /complete] 异常: " + error.message);

    if (error.message === "SESSION_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "会话不存在。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

// ==================== 顺序刷题端点 ====================

/**
 * @openapi
 * /api/v1/quiz/sequential-sessions:
 *   post:
 *     tags: [刷题]
 *     summary: 开始或继续顺序刷题（按题目原始顺序出题）
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [textbookId]
 *             properties:
 *               textbookId:
 *                 type: string
 *                 description: 题库ID
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId: { type: string }
 *                     textbookId: { type: string }
 *                     textbookName: { type: string }
 *                     totalCount: { type: integer }
 *                     status: { type: string }
 *                     createdFrom: { type: string }
 *       400:
 *         description: 参数校验失败
 *       404:
 *         description: 题库不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/sequential-sessions", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /sequential-sessions] 收到请求，textbookId: " + req.body.textbookId);

  try {
    const { textbookId } = req.body;

    if (!textbookId) {
      return res.status(400).json({ code: 400, message: "题库ID（textbookId）不能为空。", data: null });
    }

    const result = await quizService.startSequentialSession(req.userId, textbookId);

    return res.status(200).json({ code: 0, message: "成功", data: result });
  } catch (error) {
    console.error(TAG + " [POST /sequential-sessions] 异常: " + error.message);

    if (error.message === "TEXTBOOK_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "题库不存在或无权访问。", data: null });
    }
    if (error.message === "NO_QUESTIONS_AVAILABLE") {
      return res.status(400).json({ code: 400, message: "该题库没有题目，请先导入题目。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/sequential-sessions/{sessionId}:
 *   get:
 *     tags: [刷题]
 *     summary: 获取顺序刷题会话详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: 会话ID
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId: { type: string }
 *                     textbookId: { type: string }
 *                     textbookName: { type: string }
 *                     status: { type: string }
 *                     totalCount: { type: integer }
 *                     answeredCount: { type: integer }
 *                     currentQuestionIndex: { type: integer }
 *                     questions: { type: array }
 *                     answers: { type: object }
 *                     typeCounts: { type: object }
 *       404:
 *         description: 会话不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/sequential-sessions/:sessionId", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /sequential-sessions/:sessionId] 收到请求，sessionId: " + req.params.sessionId);

  try {
    const result = await quizService.getSequentialSessionDetail(req.userId, req.params.sessionId);

    return res.status(200).json({ code: 0, message: "成功", data: result });
  } catch (error) {
    console.error(TAG + " [GET /sequential-sessions/:sessionId] 异常: " + error.message);

    if (error.message === "SESSION_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "会话不存在或无权访问。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/sequential-sessions/{sessionId}/progress:
 *   put:
 *     tags: [刷题]
 *     summary: 保存顺序刷题进度和作答
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: 会话ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentQuestionIndex]
 *             properties:
 *               currentQuestionIndex:
 *                 type: integer
 *                 description: 当前题目序号（1-based）
 *               questionId:
 *                 type: string
 *                 description: 作答题目ID
 *               answer:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                 description: 用户答案
 *     responses:
 *       200:
 *         description: 保存成功
 *       400:
 *         description: 会话已结束
 *       404:
 *         description: 会话不存在
 *       500:
 *         description: 服务器内部错误
 */
router.put("/sequential-sessions/:sessionId/progress", authenticateToken, async (req, res) => {
  console.log(TAG + " [PUT /sequential-sessions/:sessionId/progress] 收到请求");

  try {
    const result = await quizService.saveSequentialSessionProgress(
      req.userId,
      req.params.sessionId,
      {
        currentQuestionIndex: req.body.currentQuestionIndex,
        questionId: req.body.questionId,
        answer: req.body.answer,
      }
    );

    return res.status(200).json({ code: 0, message: "保存成功", data: result });
  } catch (error) {
    console.error(TAG + " [PUT /sequential-progress] 异常: " + error.message);

    if (error.message === "SESSION_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "会话不存在。", data: null });
    }
    if (error.message === "SESSION_NOT_ACTIVE") {
      return res.status(400).json({ code: 400, message: "会话已结束，无法保存。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/sequential-sessions/{sessionId}/complete:
 *   post:
 *     tags: [刷题]
 *     summary: 交卷完成顺序刷题会话
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: 会话ID
 *     responses:
 *       200:
 *         description: 交卷成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId: { type: string }
 *                     status: { type: string }
 *                     reportId: { type: string }
 *                     reportStatus: { type: string }
 *       404:
 *         description: 会话不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/sequential-sessions/:sessionId/complete", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /sequential-sessions/:sessionId/complete] 收到请求");

  try {
    const result = await quizService.completeSequentialSession(req.userId, req.params.sessionId);

    return res.status(200).json({ code: 0, message: "交卷成功", data: result });
  } catch (error) {
    console.error(TAG + " [POST /sequential-complete] 异常: " + error.message);

    if (error.message === "SESSION_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "会话不存在。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

module.exports = router;
