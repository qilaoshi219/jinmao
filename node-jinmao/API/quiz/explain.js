// ==================== 错题 AI 讲解路由模块 ====================
// 职责：刷题报告/错题本中的"AI 讲解"——根据题目与参考答案生成通俗讲解
// 端点：
//   POST /api/v1/quiz/explain — 生成单题讲解（需 Token，按 DeepSeek flash 计费）

const express = require("express");
const router = express.Router();
const prisma = require("../../utils/prisma");
const llmClient = require("../../utils/llm_client");
const { checkCanUseAI } = require("../../utils/balance");
const { authenticateToken } = require("../../middleware/auth");

// 日志前缀
const TAG = "[API_quiz_explain]";

// 系统提示词：稳定的人设与输出要求（与 course_ai 一致的讲解风格）
const SYSTEM_PROMPT = [
  "你是「金毛教你学」的题目讲解老师，负责把题目讲清楚、讲明白。",
  "回答要求：",
  "1. 先给出正确答案，再解释为什么（结合知识点讲原理，不要只背答案）；",
  "2. 若题目有解析，请把解析展开成通俗易懂的语言，补充易错点；",
  "3. 若为多选题，说明每个选项对与不对的原因；若为判断题，说明判定依据；",
  "4. 使用通俗易懂的中文，分点作答，长度控制在 300 字以内；",
  "5. 不要编造题目中未提供的信息。",
].join("\n");

/**
 * 组装用户问题文本（题干/选项/答案/解析）
 */
function buildQuestionPrompt(q) {
  const lines = ["题目：" + (q.content || "").trim()];
  if (Array.isArray(q.options) && q.options.length > 0) {
    lines.push("选项：" + q.options.map((o) => (o.key || "") + ". " + (o.value || "")).join("；"));
  }
  lines.push("正确答案：" + (q.answer || ""));
  if (q.analysis) lines.push("题目解析：" + String(q.analysis).trim());
  lines.push("请讲解这道题。");
  return lines.join("\n");
}

/**
 * @openapi
 * /api/v1/quiz/explain:
 *   post:
 *     tags: [错题本]
 *     summary: 生成错题 AI 讲解
 *     description: 根据题目内容、正确答案与解析，调用 DeepSeek 生成通俗讲解（按经济版 flash 计费）。
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [questionId]
 *             properties:
 *               questionId: { type: string, example: "12", description: "题目 ID" }
 *     responses:
 *       200:
 *         description: 讲解生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "ok" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     questionId: { type: string, example: "12" }
 *                     explanation: { type: string, example: "先给结论..." }
 *       400:
 *         description: 参数不合法
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "题目 ID（questionId）不能为空。" }
 *       401:
 *         description: 未认证 / Token 无效或已过期
 *       402:
 *         description: 余额不足或已锁定
 *       404:
 *         description: 题目不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/explain", authenticateToken, async (req, res) => {
  const questionId = req.body?.questionId;
  console.log(TAG + "[POST /explain] 收到请求，userId: " + req.userId + "，questionId: " + questionId);

  if (!questionId || !/^\d+$/.test(String(questionId))) {
    return res.status(400).json({ code: 400, message: "题目 ID（questionId）不能为空。", data: null });
  }

  try {
    // 1. 加载题目（题干/选项/答案/解析）
    const question = await prisma.quizQuestion.findUnique({
      where: { id: BigInt(questionId) },
      select: { id: true, content: true, options: true, answer: true, analysis: true },
    });
    if (!question) {
      return res.status(404).json({ code: 404, message: "题目不存在。", data: null });
    }

    // 2. 余额预检（锁定用户拒绝，避免 AI 消费）
    const balanceCheck = await checkCanUseAI(req.userId);
    if (!balanceCheck.allowed) {
      return res.status(402).json({ code: 402, message: balanceCheck.reason || "余额不足，请充值后再试。", data: null });
    }

    // 3. 调用 DeepSeek flash 生成讲解（计费由 llm_client 内部完成）
    const result = await llmClient.chat(req.userId, "quiz_explain", {
      modelSize: "small",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildQuestionPrompt(question) },
      ],
    });

    if (result.code !== 200) {
      console.error(TAG + " AI 讲解生成失败: " + (result.message || "未知错误"));
      return res.status(500).json({ code: 500, message: "AI 讲解生成失败：" + (result.message || "请稍后再试。"), data: null });
    }

    const explanation = String(result.message.content || "").trim();
    if (!explanation) {
      return res.status(500).json({ code: 500, message: "AI 讲解内容为空，请稍后再试。", data: null });
    }

    console.log(TAG + " AI 讲解生成成功，questionId: " + questionId + "，长度: " + explanation.length);
    return res.status(200).json({ code: 0, message: "ok", data: { questionId: String(question.id), explanation } });
  } catch (error) {
    console.error(TAG + "[POST /explain] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

module.exports = router;
