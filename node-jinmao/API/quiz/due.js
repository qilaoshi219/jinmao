// ==================== 记忆曲线复习路由模块 ====================
// 职责：基于错题记录按艾宾浩斯间隔（1/3/7/15 天）计算到期复习清单
// 端点：
//   GET /api/v1/quiz/wrongbook/due-reviews — 到期错题清单（需 Token）

const express = require("express");
const router = express.Router();
const prisma = require("../../utils/prisma");
const { authenticateToken } = require("../../middleware/auth");

// 日志前缀
const TAG = "[API_quiz_due]";

// 艾宾浩斯复习间隔（天），按错误次数选择：第1次错→1天后，2次→3天，3次→7天，≥4次→15天
const REVIEW_INTERVALS_DAYS = [1, 3, 7, 15];

/** 根据错误次数取复习间隔（天） */
function intervalDays(wrongCount) {
  const idx = Math.min(Math.max(wrongCount - 1, 0), REVIEW_INTERVALS_DAYS.length - 1);
  return REVIEW_INTERVALS_DAYS[idx];
}

/**
 * @openapi
 * /api/v1/quiz/wrongbook/due-reviews:
 *   get:
 *     tags: [错题本]
 *     summary: 获取记忆曲线到期复习清单
 *     description: 按错题次数对应的艾宾浩斯间隔（1/3/7/15 天）判断哪些错题今天到期，按教材分组返回。
 *     security:
 *       - bearerAuth: []
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
 *                     dueCount: { type: integer }
 *                     totalWrong: { type: integer }
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           textbookId: { type: string }
 *                           textbookName: { type: string }
 *                           dueCount: { type: integer }
 *                           questions:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 questionId: { type: string }
 *                                 type: { type: string }
 *                                 content: { type: string }
 *                                 wrongCount: { type: integer }
 *                                 dueInDays: { type: integer }
 *                                 lastWrongAt: { type: string }
 *       401:
 *         description: 未认证
 *       500:
 *         description: 服务器内部错误
 */
router.get("/wrongbook/due-reviews", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET due-reviews] 收到请求，userId: " + req.userId);
  try {
    const uid = BigInt(req.userId);
    const wrongs = await prisma.quizWrongQuestion.findMany({
      where: { userId: uid },
      include: {
        question: { select: { id: true, type: true, content: true } },
        textbook: { select: { id: true, name: true } },
      },
      orderBy: { updateTime: "desc" },
    });

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const groupMap = new Map();
    let dueCount = 0;

    for (const w of wrongs) {
      const interval = intervalDays(w.wrongCount);
      const lastWrongMs = new Date(w.updateTime).getTime();
      const dueMs = lastWrongMs + interval * DAY_MS;
      const isDue = now >= dueMs;
      const dueInDays = Math.max(0, Math.ceil((dueMs - now) / DAY_MS));

      const tid = String(w.textbookId);
      if (!groupMap.has(tid)) {
        groupMap.set(tid, { textbookId: tid, textbookName: w.textbook.name, dueCount: 0, questions: [] });
      }
      const group = groupMap.get(tid);
      if (isDue) {
        group.dueCount += 1;
        dueCount += 1;
      }
      group.questions.push({
        questionId: String(w.questionId),
        type: w.question.type,
        content: String(w.question.content || "").slice(0, 120),
        wrongCount: w.wrongCount,
        due: isDue,
        dueInDays: isDue ? 0 : dueInDays,
        lastWrongAt: w.updateTime.toISOString(),
      });
    }

    const groups = Array.from(groupMap.values());
    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: {
        dueCount,
        totalWrong: wrongs.length,
        groups,
      },
    });
  } catch (error) {
    console.error(TAG + "[GET due-reviews] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

module.exports = router;
