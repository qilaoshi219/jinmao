// ==================== AI 文本格式化路由模块 ====================
// 职责：接收原始题目文本，调用 DeepSeek AI 将其格式化为结构化题目 JSON
// 端点：POST /api/v1/quiz/format-text
// 用途：为"文本粘贴导入题库"页面提供 AI 格式化能力

const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const { authenticateToken } = require("../../middleware/auth");
const llmClient = require("../../utils/llm_client");

// 日志前缀
const TAG = "[API_quiz_format-text]";

// 文本最大字符数限制（100000 字符 ≈ 5 万汉字）
const MAX_TEXT_LENGTH = 100000;

/**
 * @openapi
 * /api/v1/quiz/format-text:
 *   post:
 *     tags: [题库]
 *     summary: AI 格式化题目文本
 *     description: 接收原始题目文本，调用 DeepSeek AI 将混合的题目+答案文本格式化为结构化 JSON 题目数组
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text, textbookName]
 *             properties:
 *               text: { type: string, description: "原始题目文本（题目+答案混合）", example: "1. 中国的首都是哪里？\nA. 上海 B. 北京 C. 广州 D. 深圳\n答案：B" }
 *               textbookName: { type: string, description: "题库名称（帮助 AI 理解领域上下文）", example: "地理知识题库" }
 *           example:
 *             text: "1. 中国的首都是哪里？\nA. 上海 B. 北京 C. 广州 D. 深圳\n答案：B\n\n2. 以下哪些是行星？\nA. 地球 B. 太阳 C. 火星 D. 月球\n答案：AC"
 *             textbookName: "天文知识题库"
 *     responses:
 *       200:
 *         description: 格式化成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "格式化完成，共识别 2 道题目。" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     questions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type: { type: string, enum: [single, multiple, judge, fill, essay] }
 *                           question: { type: string }
 *                           options: { type: array, items: { type: string } }
 *                           answer: { oneOf: [{ type: string }, { type: array, items: { type: string } }, { type: boolean }] }
 *                           explanation: { type: string }
 *       400:
 *         description: 请求参数错误（文本为空或超出长度限制）
 *       500:
 *         description: AI 调用失败或服务内部错误
 */
router.post("/format-text", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /format-text] 收到文本格式化请求，userId: " + req.userId);

  try {
    const { text, textbookName } = req.body;

    // ========== 参数校验 ==========
    // 文本不能为空
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        code: 400,
        message: "题目文本（text）不能为空。",
        data: null,
      });
    }

    // 文本长度限制（防止上下文爆炸和超时）
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({
        code: 400,
        message: "文本过长（" + text.length + " 字符），单次最多支持 " + MAX_TEXT_LENGTH + " 字符。请分批导入。",
        data: null,
      });
    }

    // 题库名称不能为空（帮助 AI 理解上下文）
    if (!textbookName || typeof textbookName !== "string" || !textbookName.trim()) {
      return res.status(400).json({
        code: 400,
        message: "题库名称（textbookName）不能为空。",
        data: null,
      });
    }

    console.log(TAG + " 文本长度: " + text.length + " 字符, 题库名: " + textbookName);

    // ========== 余额校验 ==========
    const { checkCanUseAI } = require("../../utils/balance");
    const balanceCheck = await checkCanUseAI(req.userId);
    if (!balanceCheck.allowed) {
      console.log(TAG + " [POST /format-text] 余额不足，拒绝格式化: " + balanceCheck.reason);
      return res.status(402).json({
        code: 402,
        message: balanceCheck.reason,
        data: { balance: balanceCheck.balance, balanceLocked: balanceCheck.balanceLocked },
      });
    }

    // ========== 加载 AI Prompt 模板 ==========
    // 从配置文件中读取格式化 prompt
    const promptPath = path.join(__dirname, "../../config/quiz-format-text-prompt.md");
    let systemPrompt = "";
    try {
      systemPrompt = fs.readFileSync(promptPath, "utf-8");
      console.log(TAG + " 已加载 Prompt 模板，长度: " + systemPrompt.length + " 字符");
    } catch (err) {
      console.error(TAG + " 无法加载 Prompt 模板: " + err.message);
      return res.status(500).json({
        code: 500,
        message: "服务器内部错误：无法加载 AI Prompt 配置。",
        data: null,
      });
    }

    // ========== 调用 DeepSeek AI 格式化 ==========
    // 使用大模型（pro），需要准确识别题型、选项边界、答案关系
    // response_format 设为 json_object 确保 AI 返回合法 JSON
    console.log(TAG + " 开始调用 DeepSeek AI 格式化...");

    const aiResult = await llmClient.chat(req.userId, "quiz_format_text", {
      modelSize: "big", // 使用大模型确保准确率
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: "请将以下关于【" + textbookName.trim() + "】的题目文本格式化为 JSON 结构：\n\n---\n" + text.trim() + "\n---",
        },
      ],
      response_format: { type: "json_object" }, // 强制 JSON 输出
    });

    // ========== 处理 AI 返回结果 ==========
    if (aiResult.code !== 200) {
      console.error(TAG + " DeepSeek API 调用失败: " + (aiResult.message || "未知错误"));
      return res.status(500).json({
        code: 500,
        message: "AI 格式化失败: " + (aiResult.message || "API 调用异常，请稍后重试"),
        data: null,
      });
    }

    // AI 返回的 content 在 aiResult.message.content 中
    const rawContent = aiResult.message?.content || "";
    console.log(TAG + " DeepSeek 返回内容长度: " + rawContent.length + " 字符");

    // ========== 解析 AI 返回的 JSON ==========
    let parsedResult = null;
    try {
      // 清洗可能的 markdown 代码块包裹
      let jsonStr = rawContent.trim();
      // 去除 ```json 和 ``` 包裹
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.slice(7); // 去除 "```json"
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.slice(3); // 去除 "```"
      }
      if (jsonStr.endsWith("```")) {
        jsonStr = jsonStr.slice(0, -3); // 去除结尾 "```"
      }
      jsonStr = jsonStr.trim();

      parsedResult = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error(TAG + " AI 返回内容 JSON 解析失败: " + parseErr.message);
      console.error(TAG + " 原始内容(前200字): " + rawContent.substring(0, 200));
      return res.status(500).json({
        code: 500,
        message: "AI 格式化结果解析失败，请尝试重新格式化。原因: " + parseErr.message,
        data: null,
      });
    }

    // ========== 提取 questions 数组 ==========
    // AI 可能返回 { questions: [...] } 或直接的数组 [...]
    let questions = [];
    if (parsedResult.questions && Array.isArray(parsedResult.questions)) {
      questions = parsedResult.questions;
    } else if (Array.isArray(parsedResult)) {
      questions = parsedResult;
    } else {
      console.error(TAG + " AI 返回的 JSON 结构不符合预期: " + JSON.stringify(parsedResult).substring(0, 300));
      return res.status(500).json({
        code: 500,
        message: "AI 格式化结果结构异常，请尝试重新格式化。",
        data: null,
      });
    }

    // ========== 校验题目数据 ==========
    if (questions.length === 0) {
      return res.status(200).json({
        code: 0,
        message: "AI 未识别到有效题目，请检查输入文本是否包含完整题目和答案信息。",
        data: { questions: [] },
      });
    }

    // 确保每道题都有必需字段
    const validQuestions = questions.map((q, idx) => {
      return {
        type: q.type || "single", // 默认单选题
        question: q.question || "",
        options: Array.isArray(q.options) ? q.options : [],
        answer: q.answer !== undefined ? q.answer : "",
        explanation: q.explanation || "",
      };
    }).filter((q) => q.question.trim()); // 过滤无题干的题目

    console.log(TAG + " 格式化完成 — 原始识别: " + questions.length + " 题, 有效题目: " + validQuestions.length + " 题");

    // ========== 后置余额检查：格式化完成后若余额为负则锁定用户 ==========
    const { lockUserIfNegative } = require("../../utils/balance");
    lockUserIfNegative(req.userId).catch(() => {});

    // ========== 返回成功结果 ==========
    return res.status(200).json({
      code: 0,
      message: "格式化完成，共识别 " + validQuestions.length + " 道题目。",
      data: {
        questions: validQuestions,
      },
    });
  } catch (error) {
    console.error(TAG + " [POST /format-text] 异常: " + error.message);
    console.error(error.stack);
    return res.status(500).json({
      code: 500,
      message: "服务器内部错误: " + error.message,
      data: null,
    });
  }
});

module.exports = router;
