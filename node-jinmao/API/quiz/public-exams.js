// ==================== 公开考试（二维码考试）路由模块 ====================
// 职责：公开考试的发布管理（所有者）与免登录考试接口（游客/登录双身份）
// 端点：/api/v1/quiz/public-exams/*

const express = require("express");
const router = express.Router();
const { authenticateToken, authenticateOptional } = require("../../middleware/auth");
const publicExamService = require("../../service/public_exam_service");

// 日志前缀
const TAG = "[API_public_exam]";

/**
 * 统一错误码映射
 */
function mapError(error) {
  const msg = error.message;
  switch (msg) {
    case "NOT_FOUND": return { status: 404, code: 404, message: "考试不存在或已结束。" };
    case "EXAM_NOT_FOUND": return { status: 404, code: 404, message: "试卷不存在或无权操作。" };
    case "EXAM_CLOSED": return { status: 400, code: 400, message: "考试已结束，无法进入。" };
    case "NO_QUESTIONS_AVAILABLE": return { status: 400, code: 400, message: "该试卷没有题目，无法发布。" };
    case "FORBIDDEN": return { status: 403, code: 403, message: "无权操作该考试。" };
    case "INVALID_EXAM_ID": return { status: 400, code: 400, message: "试卷ID不合法。" };
    case "INVALID_DURATION": return { status: 400, code: 400, message: "限时时长不合法（1-600 分钟）。" };
    case "INVALID_ESSAY_MODE": return { status: 400, code: 400, message: "简答题判题模式不合法。" };
    case "INVALID_STATUS": return { status: 400, code: 400, message: "状态值不合法。" };
    case "ESSAY_KEYWORDS_REQUIRED": return { status: 400, code: 400, message: "严格模式下每道简答题都必须填写关键词。" };
    case "BALANCE_INSUFFICIENT": return { status: 402, code: 402, message: "余额不足，暂不启用AI判题，请先充值。" };
    case "ANONYMOUS_KEY_REQUIRED": return { status: 400, code: 400, message: "缺少游客身份标识，请刷新页面后重试。" };
    case "ANONYMOUS_KEY_INVALID": return { status: 400, code: 400, message: "游客身份标识不合法，请刷新页面后重试。" };
    case "SESSION_NOT_FOUND": return { status: 404, code: 404, message: "考试会话不存在或无权访问。" };
    case "SESSION_NOT_ACTIVE": return { status: 400, code: 400, message: "考试会话已结束。" };
    case "QUESTION_NOT_IN_SESSION": return { status: 400, code: 400, message: "题目不在本场考试中。" };
    case "QUESTION_NOT_FOUND": return { status: 404, code: 404, message: "题目不存在。" };
    default: return { status: 500, code: 500, message: "服务器内部错误: " + error.message };
  }
}

function handleError(res, error) {
  const mapped = mapError(error);
  console.error(TAG + " 异常: " + error.message);
  return res.status(mapped.status).json({ code: mapped.code, message: mapped.message, data: null });
}

// ==================== 发布与管理（需登录，仅所有者） ====================

/**
 * @openapi
 * /api/v1/quiz/public-exams/publish:
 *   post:
 *     tags: [公开考试]
 *     summary: 发布/更新公开考试（二维码考试）
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [examId]
 *             properties:
 *               examId: { type: string }
 *               durationMinutes: { type: integer, default: 60 }
 *               essayMode: { type: string, enum: [ai, strict, full], default: full }
 *               essayKeywords: { type: object }
 *               shuffle: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: 成功
 */
router.post("/public-exams/publish", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /publish] 发布公开考试，examId: " + req.body.examId);
  try {
    const result = await publicExamService.publishExam(req.userId, req.body);
    return res.status(200).json({ code: 0, message: result.created ? "公开考试发布成功" : "公开考试配置已更新", data: result.publicExam });
  } catch (error) {
    return handleError(res, error);
  }
});

/**
 * @openapi
 * /api/v1/quiz/public-exams/exam-info:
 *   get:
 *     tags: [公开考试]
 *     summary: 获取发布表单数据（试卷简答题列表 + 已发布配置）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: examId
 *         in: query
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 */
router.get("/public-exams/exam-info", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /exam-info] examId: " + req.query.examId);
  try {
    const data = await publicExamService.getPublishForm(req.userId, req.query.examId);
    return res.status(200).json({ code: 0, message: "查询成功", data });
  } catch (error) {
    return handleError(res, error);
  }
});

/**
 * @openapi
 * /api/v1/quiz/public-exams/my:
 *   get:
 *     tags: [公开考试]
 *     summary: 我的公开考试列表（"选择考试"页）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: 成功
 */
router.get("/public-exams/my", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /my] 我的公开考试列表，userId: " + req.userId);
  try {
    const data = await publicExamService.listMyPublicExams(req.userId, req.query.page, req.query.pageSize);
    return res.status(200).json({ code: 0, message: "查询成功", data });
  } catch (error) {
    return handleError(res, error);
  }
});

/**
 * @openapi
 * /api/v1/quiz/public-exams/{token}/status:
 *   post:
 *     tags: [公开考试]
 *     summary: 停止/恢复考试
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [published, closed] }
 *     responses:
 *       200:
 *         description: 成功
 */
router.post("/public-exams/:token/status", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /:token/status] token: " + req.params.token + ", status: " + req.body.status);
  try {
    const data = await publicExamService.setPublicExamStatus(req.params.token, req.userId, req.body.status);
    return res.status(200).json({ code: 0, message: data.status === "closed" ? "考试已停止" : "考试已恢复", data });
  } catch (error) {
    return handleError(res, error);
  }
});

/**
 * @openapi
 * /api/v1/quiz/public-exams/{token}:
 *   delete:
 *     tags: [公开考试]
 *     summary: 取消发布（软删除公开考试）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 */
router.delete("/public-exams/:token", authenticateToken, async (req, res) => {
  console.log(TAG + " [DELETE /:token] token: " + req.params.token);
  try {
    const data = await publicExamService.unpublishExam(req.params.token, req.userId);
    return res.status(200).json({ code: 0, message: "已取消发布", data });
  } catch (error) {
    return handleError(res, error);
  }
});

/**
 * @openapi
 * /api/v1/quiz/public-exams/{token}/stats:
 *   get:
 *     tags: [公开考试]
 *     summary: 考试统计数据（所有者）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: 成功
 */
router.get("/public-exams/:token/stats", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /:token/stats] token: " + req.params.token);
  try {
    const data = await publicExamService.getStats({
      token: req.params.token,
      userId: req.userId,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    return res.status(200).json({ code: 0, message: "查询成功", data });
  } catch (error) {
    return handleError(res, error);
  }
});

// ==================== 免登录考试接口（可选鉴权） ====================

/**
 * @openapi
 * /api/v1/quiz/public-exams/{token}:
 *   get:
 *     tags: [公开考试]
 *     summary: 获取考试信息（免登录）
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 */
router.get("/public-exams/:token", async (req, res) => {
  console.log(TAG + " [GET /:token] token: " + req.params.token);
  try {
    const data = await publicExamService.getPublicInfo(req.params.token);
    return res.status(200).json({ code: 0, message: "查询成功", data });
  } catch (error) {
    return handleError(res, error);
  }
});

/**
 * @openapi
 * /api/v1/quiz/public-exams/{token}/start:
 *   post:
 *     tags: [公开考试]
 *     summary: 开始/续做考试（可选鉴权）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               anonymousKey: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 */
router.post("/public-exams/:token/start", authenticateOptional, async (req, res) => {
  console.log(TAG + " [POST /:token/start] token: " + req.params.token + ", userId: " + (req.userId || "游客"));
  try {
    const data = await publicExamService.startAttempt({
      token: req.params.token,
      userId: req.userId,
      anonymousKey: req.body.anonymousKey,
    });
    return res.status(200).json({ code: 0, message: "成功", data });
  } catch (error) {
    return handleError(res, error);
  }
});

/**
 * @openapi
 * /api/v1/quiz/public-exams/{token}/session/{sessionId}:
 *   get:
 *     tags: [公开考试]
 *     summary: 获取答题页详情（可选鉴权）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: anonymousKey
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 */
router.get("/public-exams/:token/session/:sessionId", authenticateOptional, async (req, res) => {
  console.log(TAG + " [GET /:token/session/:sessionId] token: " + req.params.token + ", sessionId: " + req.params.sessionId);
  try {
    const data = await publicExamService.getAttemptDetail({
      token: req.params.token,
      sessionId: req.params.sessionId,
      userId: req.userId,
      anonymousKey: req.query.anonymousKey,
    });
    return res.status(200).json({ code: 0, message: "成功", data });
  } catch (error) {
    return handleError(res, error);
  }
});

/**
 * @openapi
 * /api/v1/quiz/public-exams/{token}/session/{sessionId}/progress:
 *   put:
 *     tags: [公开考试]
 *     summary: 保存作答进度（可选鉴权）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema: { type: string }
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
 *               anonymousKey: { type: string }
 *               currentQuestionIndex: { type: integer }
 *               questionId: { type: string }
 *               answer: { oneOf: [{ type: string }, { type: array }] }
 *     responses:
 *       200:
 *         description: 成功
 */
router.put("/public-exams/:token/session/:sessionId/progress", authenticateOptional, async (req, res) => {
  console.log(TAG + " [PUT /:token/session/:sessionId/progress] sessionId: " + req.params.sessionId);
  try {
    const data = await publicExamService.saveProgress({
      token: req.params.token,
      sessionId: req.params.sessionId,
      userId: req.userId,
      anonymousKey: req.body.anonymousKey,
      payload: {
        currentQuestionIndex: req.body.currentQuestionIndex,
        questionId: req.body.questionId,
        answer: req.body.answer,
      },
    });
    return res.status(200).json({ code: 0, message: "保存成功", data });
  } catch (error) {
    return handleError(res, error);
  }
});

/**
 * @openapi
 * /api/v1/quiz/public-exams/{token}/session/{sessionId}/complete:
 *   post:
 *     tags: [公开考试]
 *     summary: 交卷（可选鉴权，超时自动交卷）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               anonymousKey: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 */
router.post("/public-exams/:token/session/:sessionId/complete", authenticateOptional, async (req, res) => {
  console.log(TAG + " [POST /:token/session/:sessionId/complete] sessionId: " + req.params.sessionId);
  try {
    const data = await publicExamService.completeAttempt({
      token: req.params.token,
      sessionId: req.params.sessionId,
      userId: req.userId,
      anonymousKey: req.body.anonymousKey,
    });
    return res.status(200).json({ code: 0, message: "交卷成功", data });
  } catch (error) {
    return handleError(res, error);
  }
});

/**
 * @openapi
 * /api/v1/quiz/public-exams/{token}/session/{sessionId}/result:
 *   get:
 *     tags: [公开考试]
 *     summary: 查询交卷结果（可选鉴权，AI 简答批改轮询用）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: anonymousKey
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 */
router.get("/public-exams/:token/session/:sessionId/result", authenticateOptional, async (req, res) => {
  console.log(TAG + " [GET /:token/session/:sessionId/result] sessionId: " + req.params.sessionId);
  try {
    const data = await publicExamService.getResult({
      token: req.params.token,
      sessionId: req.params.sessionId,
      userId: req.userId,
      anonymousKey: req.query.anonymousKey,
    });
    return res.status(200).json({ code: 0, message: "查询成功", data });
  } catch (error) {
    return handleError(res, error);
  }
});

module.exports = router;
