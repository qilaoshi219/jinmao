// ==================== 错题本路由模块 ====================
// 职责：错题概览、复习会话、错题作答
// 端点：/api/v1/quiz/wrongbook*

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../../middleware/auth");
const quizRepo = require("../../repo/quiz_repo");
const quizService = require("../../service/quiz_service");

// 日志前缀
const TAG = "[API_quiz_wrongbook]";

/**
 * @openapi
 * /api/v1/quiz/wrongbook/overview:
 *   get:
 *     tags: [错题本]
 *     summary: 错题概览
 *     description: 按教材分组统计用户的所有错题
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 查询成功
 */
router.get("/wrongbook/overview", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /wrongbook/overview] 收到请求");

  try {
    const overview = await quizRepo.getWrongbookOverview(req.userId);

    return res.status(200).json({ code: 0, message: "查询成功", data: overview });
  } catch (error) {
    console.error(TAG + " [GET /wrongbook/overview] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/wrongbook/review-status:
 *   get:
 *     tags: [错题本]
 *     summary: 批量查询错题复习会话状态
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
router.get("/wrongbook/review-status", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /wrongbook/review-status] 收到请求");

  try {
    const textbookIds = (req.query.textbookIds || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (textbookIds.length === 0) {
      return res.status(200).json({ code: 0, message: "查询成功", data: [] });
    }

    // 复用随机刷题的会话状态查询，查找 REVIEW 模式的会话
    const prisma = require("../../utils/prisma");
    const bigUserId = BigInt(req.userId);
    const bigTextbookIds = textbookIds.map((id) => BigInt(id));

    const activeSessions = await prisma.quizSession.findMany({
      where: {
        userId: bigUserId,
        textbookId: { in: bigTextbookIds },
        mode: "REVIEW",
        status: "IN_PROGRESS",
      },
      orderBy: { updateTime: "desc" },
      select: { id: true, textbookId: true, updatedAt: true },
    });

    const sessionMap = new Map();
    for (const session of activeSessions) {
      const tid = session.textbookId.toString();
      if (!sessionMap.has(tid)) {
        sessionMap.set(tid, {
          sessionId: session.id.toString(),
          updatedAt: session.updatedAt.toISOString(),
        });
      }
    }

    const result = bigTextbookIds.map((tid) => {
      const strId = tid.toString();
      const session = sessionMap.get(strId);
      return {
        textbookId: strId,
        hasActiveSession: !!session,
        sessionId: session ? session.sessionId : null,
        updatedAt: session ? session.updatedAt : null,
      };
    });

    return res.status(200).json({ code: 0, message: "查询成功", data: result });
  } catch (error) {
    console.error(TAG + " [GET /wrongbook/review-status] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/wrongbook/review-sessions:
 *   post:
 *     tags: [错题本]
 *     summary: 开始或继续错题复习
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
router.post("/wrongbook/review-sessions", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /wrongbook/review-sessions] 收到请求，textbookId: " + req.body.textbookId);

  try {
    const { textbookId } = req.body;

    if (!textbookId) {
      return res.status(400).json({ code: 400, message: "题库ID（textbookId）不能为空。", data: null });
    }

    // 获取错题ID列表
    const wrongQuestionIds = await quizRepo.getWrongQuestionIds(req.userId, textbookId);

    if (wrongQuestionIds.length === 0) {
      // 检查是否有错题
      const prisma = require("../../utils/prisma");
      const count = await prisma.quizWrongQuestion.count({
        where: { userId: BigInt(req.userId), textbookId: BigInt(textbookId) },
      });
      if (count === 0) {
        return res.status(400).json({ code: 400, message: "该教材没有错题记录。", data: null });
      }
      // 有记录但题目可能被删了
    }

    // 检查是否有进行中的复习会话
    const prisma = require("../../utils/prisma");
    const existingSession = await prisma.quizSession.findFirst({
      where: {
        userId: BigInt(req.userId),
        textbookId: BigInt(textbookId),
        mode: "REVIEW",
        status: "IN_PROGRESS",
      },
      orderBy: { updateTime: "desc" },
    });

    if (existingSession) {
      return res.status(200).json({
        code: 0,
        message: "继续上次复习",
        data: {
          sessionId: existingSession.id.toString(),
          textbookId,
          totalCount: existingSession.totalCount,
          status: existingSession.status,
          createdFrom: "existing",
        },
      });
    }

    // 创建新复习会话
    const questionIdStrings = wrongQuestionIds.map((id) => id.toString());
    const session = await quizRepo.createQuizSession({
      userId: req.userId,
      textbookId,
      examId: null,
      mode: "REVIEW",
      questionIds: questionIdStrings,
      totalCount: questionIdStrings.length,
    });

    return res.status(200).json({
      code: 0,
      message: "复习会话已创建",
      data: {
        sessionId: session.id.toString(),
        textbookId,
        totalCount: session.totalCount,
        status: session.status,
        createdFrom: "new",
      },
    });
  } catch (error) {
    console.error(TAG + " [POST /wrongbook/review-sessions] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/wrongbook/review-sessions/{sessionId}:
 *   get:
 *     tags: [错题本]
 *     summary: 获取错题会话详情（单题模式）
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
router.get("/wrongbook/review-sessions/:sessionId", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /wrongbook/review-sessions/:sessionId] 收到请求");

  try {
    // 复用刷题服务获取会话详情
    const sessionDetail = await quizService.getRandomSessionDetail(req.userId, req.params.sessionId);

    return res.status(200).json({ code: 0, message: "查询成功", data: sessionDetail });
  } catch (error) {
    console.error(TAG + " [GET /wrongbook/review-sessions/:sessionId] 异常: " + error.message);

    if (error.message === "SESSION_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "会话不存在。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/wrongbook/review-sessions/{sessionId}/submit:
 *   post:
 *     tags: [错题本]
 *     summary: 提交错题作答
 *     description: 答对则从错题表删除，答错则移到队列末尾（循环复习）
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
 *             required: [questionId, answer]
 *             properties:
 *               questionId: { type: string }
 *               answer: { oneOf: [{ type: string }, { type: array }] }
 *     responses:
 *       200:
 *         description: 提交成功
 */
router.post("/wrongbook/review-sessions/:sessionId/submit", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /wrongbook/review-sessions/:sessionId/submit] 收到请求");

  try {
    const { questionId, answer } = req.body;

    if (!questionId) {
      return res.status(400).json({ code: 400, message: "题目ID（questionId）不能为空。", data: null });
    }

    // 获取会话
    const session = await quizRepo.getSessionDetail(req.params.sessionId, req.userId);
    if (!session) throw new Error("SESSION_NOT_FOUND");

    // 获取题目信息
    const question = await quizRepo.getQuestionWithAnswer(BigInt(questionId));
    if (!question) throw new Error("QUESTION_NOT_FOUND");

    // 判题
    const isCorrect = quizService.evaluateAnswer({
      questionType: question.type,
      correctAnswer: question.answer,
      userAnswer: answer,
    });

    // 答对 → 从错题表删除
    if (isCorrect) {
      const prisma = require("../../utils/prisma");
      await prisma.quizWrongQuestion.deleteMany({
        where: { userId: BigInt(req.userId), questionId: BigInt(questionId) },
      });

      // 从会话题目列表中移除该题
      const currentIds = session.questionIds || [];
      const updatedIds = currentIds.filter((id) => String(id) !== String(questionId));

      // 更新会话的题目列表
      await prisma.quizSession.update({
        where: { id: BigInt(req.params.sessionId) },
        data: {
          questionIds: updatedIds,
          totalCount: updatedIds.length,
        },
      });

      console.log(TAG + " 错题答对，已从错题本移除 — questionId: " + questionId);
    } else {
      // 答错 → 错题次数+1，该题移到队列末尾
      const prisma = require("../../utils/prisma");
      await prisma.quizWrongQuestion.upsert({
        where: {
          userId_questionId: {
            userId: BigInt(req.userId),
            questionId: BigInt(questionId),
          },
        },
        create: {
          userId: BigInt(req.userId),
          questionId: BigInt(questionId),
          textbookId: question.textbookId,
          wrongCount: 1,
        },
        update: {
          wrongCount: { increment: 1 },
        },
      });

      // 将该题移到队列末尾（循环复习）
      const currentIds = (session.questionIds || []).map(String);
      const filtered = currentIds.filter((id) => String(id) !== String(questionId));
      filtered.push(String(questionId));

      await prisma.quizSession.update({
        where: { id: BigInt(req.params.sessionId) },
        data: { questionIds: filtered },
      });

      console.log(TAG + " 错题答错，已移到队末 — questionId: " + questionId);
    }

    return res.status(200).json({
      code: 0,
      message: "提交成功",
      data: { isCorrect, questionId },
    });
  } catch (error) {
    console.error(TAG + " [POST /submit] 异常: " + error.message);

    if (error.message === "SESSION_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "会话不存在。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

module.exports = router;
