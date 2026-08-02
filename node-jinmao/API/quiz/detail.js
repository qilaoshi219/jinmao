// ==================== 题库详情路由模块 ====================
// 职责：题库统计查询 + 基于试卷的刷题会话创建 + 试卷删除
// 端点：
//   GET    /api/v1/quiz/textbooks/:id/stats    — 题库统计数据
//   POST   /api/v1/quiz/exams/:examId/sequential-session — 基于试卷的顺序刷题
//   POST   /api/v1/quiz/exams/:examId/random-session     — 基于试卷的随机刷题
//   DELETE /api/v1/quiz/exams/:examId          — 删除单个试卷

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../../middleware/auth");
const quizService = require("../../service/quiz_service");
const quizRepo = require("../../repo/quiz_repo");
const prisma = require("../../utils/prisma");

// 日志前缀
const TAG = "[API_quiz_detail]";

// ==================== 题库统计端点 ====================

/**
 * @openapi
 * /api/v1/quiz/textbooks/{id}/stats:
 *   get:
 *     tags: [题库]
 *     summary: 获取题库统计数据
 *     description: 返回指定题库下当前用户的做题统计，包括已做题数、正确率、错题数等
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: 题库ID
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "查询成功" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalQuestions: { type: integer, description: "题库总题数" }
 *                     doneCount: { type: integer, description: "用户已做题数（去重）" }
 *                     correctCount: { type: integer, description: "正确题数" }
 *                     accuracy: { type: number, description: "正确率（百分比，保留1位小数）" }
 *                     wrongCount: { type: integer, description: "错题本中该题库的错题数" }
 *       401:
 *         description: 未认证
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string }
 *       404:
 *         description: 题库不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string }
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string }
 */
router.get("/textbooks/:id/stats", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /textbooks/:id/stats] 收到请求，textbookId: " + req.params.id);

  try {
    const bigUserId = BigInt(req.userId);
    const bigTextbookId = BigInt(req.params.id);

    // 1. 查询题库是否存在
    const textbook = await prisma.quizTextbook.findFirst({
      where: { id: bigTextbookId, isDeleted: false },
      select: { id: true, totalQuestions: true },
    });

    if (!textbook) {
      return res.status(404).json({ code: 404, message: "题库不存在或已删除", data: null });
    }

    // 2. 统计已做题数（去重）和正确题数
    //    通过 QuizUserAnswer 联表 QuizQuestion 过滤该题库下的题目
    const answerStats = await prisma.quizUserAnswer.groupBy({
      by: ["questionId", "isCorrect"],
      where: {
        userId: bigUserId,
        question: { textbookId: bigTextbookId },
      },
    });

    // 去重题目ID集合
    const doneQuestionIds = new Set();
    let correctCount = 0;

    for (const row of answerStats) {
      const qid = row.questionId.toString();
      doneQuestionIds.add(qid);
      if (row.isCorrect) correctCount++;
    }

    const doneCount = doneQuestionIds.size;
    const totalQuestions = textbook.totalQuestions;

    // 3. 计算正确率（保留1位小数）
    const accuracy = totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 1000) / 10
      : 0;

    // 4. 统计错题本中的错题数
    const wrongCount = await prisma.quizWrongQuestion.count({
      where: {
        userId: bigUserId,
        textbookId: bigTextbookId,
      },
    });

    console.log(TAG + " 统计完成 — 总题数: " + totalQuestions + ", 已做: " + doneCount + ", 正确: " + correctCount + ", 正确率: " + accuracy + "%, 错题: " + wrongCount);

    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: {
        totalQuestions,
        doneCount,
        correctCount,
        accuracy,
        wrongCount,
      },
    });
  } catch (error) {
    console.error(TAG + " [GET /textbooks/:id/stats] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

// ==================== 基于试卷的顺序刷题端点 ====================

/**
 * @openapi
 * /api/v1/quiz/exams/{examId}/sequential-session:
 *   post:
 *     tags: [刷题]
 *     summary: 基于试卷开始/继续顺序刷题
 *     description: 按试卷内题目的 sortOrder 升序创建顺序刷题会话。若已有进行中的会话则返回已有会话继续刷题。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: examId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: 试卷ID
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "成功" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId: { type: string, description: "会话ID" }
 *                     examId: { type: string, description: "试卷ID" }
 *                     examName: { type: string, description: "试卷名称" }
 *                     textbookId: { type: string, description: "关联题库ID" }
 *                     textbookName: { type: string, description: "题库名称" }
 *                     totalCount: { type: integer, description: "题目总数" }
 *                     status: { type: string, description: "会话状态" }
 *                     createdFrom: { type: string, enum: ["new", "existing"], description: "新建还是继续已有会话" }
 *       400:
 *         description: 参数校验失败 / 试卷无题目
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer }
 *                 message: { type: string }
 *       401:
 *         description: 未认证
 *       404:
 *         description: 试卷不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string }
 *       500:
 *         description: 服务器内部错误
 */
router.post("/exams/:examId/sequential-session", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /exams/:examId/sequential-session] 收到请求，examId: " + req.params.examId);

  try {
    const result = await quizService.startExamSequentialSession(req.userId, req.params.examId);

    return res.status(200).json({ code: 0, message: "成功", data: result });
  } catch (error) {
    console.error(TAG + " [POST /exams/:examId/sequential-session] 异常: " + error.message);

    if (error.message === "EXAM_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "试卷不存在或已删除。", data: null });
    }
    if (error.message === "NO_QUESTIONS_AVAILABLE") {
      return res.status(400).json({ code: 400, message: "该试卷没有题目，无法刷题。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

// ==================== 基于试卷的随机刷题端点 ====================

/**
 * @openapi
 * /api/v1/quiz/exams/{examId}/random-session:
 *   post:
 *     tags: [刷题]
 *     summary: 基于试卷开始/继续随机刷题
 *     description: 从试卷内按题型随机抽取题目（每种题型最多5题）创建随机刷题会话。若已有进行中的会话则返回已有会话继续刷题。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: examId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: 试卷ID
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "成功" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId: { type: string, description: "会话ID" }
 *                     examId: { type: string, description: "试卷ID" }
 *                     examName: { type: string, description: "试卷名称" }
 *                     textbookId: { type: string, description: "关联题库ID" }
 *                     textbookName: { type: string, description: "题库名称" }
 *                     totalCount: { type: integer, description: "题目总数" }
 *                     status: { type: string, description: "会话状态" }
 *                     createdFrom: { type: string, enum: ["new", "existing"], description: "新建还是继续已有会话" }
 *       400:
 *         description: 试卷无题目
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer }
 *                 message: { type: string }
 *       401:
 *         description: 未认证
 *       404:
 *         description: 试卷不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string }
 *       500:
 *         description: 服务器内部错误
 */
router.post("/exams/:examId/random-session", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /exams/:examId/random-session] 收到请求，examId: " + req.params.examId);

  try {
    const result = await quizService.startExamRandomSession(req.userId, req.params.examId);

    return res.status(200).json({ code: 0, message: "成功", data: result });
  } catch (error) {
    console.error(TAG + " [POST /exams/:examId/random-session] 异常: " + error.message);

    if (error.message === "EXAM_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "试卷不存在或已删除。", data: null });
    }
    if (error.message === "NO_QUESTIONS_AVAILABLE") {
      return res.status(400).json({ code: 400, message: "该试卷没有题目，无法刷题。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

// ==================== 删除试卷端点 ====================

/**
 * @openapi
 * /api/v1/quiz/exams/{examId}:
 *   delete:
 *     tags: [题库]
 *     summary: 删除单个试卷
 *     description: 删除指定试卷及其关联的所有题目、作答记录、错题、刷题会话和报告。若删除后题库无剩余试卷，则连题库一起删除。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: examId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: 试卷ID
 *     responses:
 *       200:
 *         description: 删除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "试卷已删除" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedTextbook: { type: boolean, description: "是否连题库一并删除" }
 *       401:
 *         description: 未认证
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string }
 *       404:
 *         description: 试卷不存在或无权操作
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string }
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string }
 */
router.delete("/exams/:examId", authenticateToken, async (req, res) => {
  console.log(TAG + " [DELETE /exams/:examId] 收到删除试卷请求，examId: " + req.params.examId);

  try {
    const result = await quizRepo.deleteExam(req.params.examId, req.userId);

    if (result.code === 404) {
      return res.status(404).json({ code: 404, message: result.message, data: null });
    }

    if (result.code === 500) {
      return res.status(500).json({ code: 500, message: result.message, data: null });
    }

    console.log(TAG + " [DELETE /exams/:examId] 删除成功，deletedTextbook: " + result.data.deletedTextbook);
    return res.status(200).json({ code: 0, message: result.message, data: result.data });
  } catch (error) {
    console.error(TAG + " [DELETE /exams/:examId] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

module.exports = router;
