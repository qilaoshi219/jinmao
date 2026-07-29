// ==================== AI 简答题判题服务 ====================
// 职责：使用项目统一的 llm_client.js（DeepSeek flash 小模型）对简答题进行 AI 评分
// 移植自金毛刷题 test/金毛刷题/backend/src/modules/quiz/deepseek-judge.ts
// 关键变化：用 llm_client.chat() 替代原始的 fetch() 调用，复用计费/心跳/错误处理

const llmClient = require("../utils/llm_client");

// 日志前缀
const TAG = "[quiz_judge]";

// ==================== 类型定义 ====================

/**
 * @typedef {Object} JudgeResult
 * @property {number} percent - 得分百分比 0-100
 * @property {string} commentary - AI 评语
 */

// ==================== 工具函数 ====================

/**
 * 安全地将值归一化为 0-100 之间的数字
 */
function normalizePercent(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * 安全地获取字符串类型的评语
 */
function normalizeCommentary(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

// ==================== 核心判题函数 ====================

/**
 * 调用 DeepSeek AI 对简答题进行判分
 *
 * @param {Object} params
 * @param {string} params.userId - 用户 ID（用于计费）
 * @param {string} params.question - 题目内容
 * @param {string} params.referenceAnswer - 参考答案
 * @param {string} params.userAnswer - 用户答案
 * @returns {Promise<JudgeResult>} 评分结果 { percent, commentary }
 */
async function judgeEssayByAI({ userId, question, referenceAnswer, userAnswer }) {
  console.log(TAG + " 开始 AI 判题 — question: " + question.substring(0, 50) + "...");

  // 构建系统提示词（中文阅卷老师角色）
  const systemPrompt = '你是严谨的考试阅卷老师。请根据\u201C题目、参考答案、用户答案\u201D给出主观题评分。只输出 JSON，不要输出多余文本。';

  // 构建用户提示词
  const userPrompt = JSON.stringify(
    {
      question,
      referenceAnswer,
      userAnswer,
      outputSchema: {
        percent: "number(0-100)",
        commentary: "string(简短解析，指出得分点与缺失点)",
      },
      scoringRules: [
        "percent 表示用户答案相对参考答案的覆盖度与正确性",
        "commentary 使用简短中文，不要超过 120 字",
      ],
    },
    null,
    2
  );

  // 使用项目统一的 llm_client 调用 DeepSeek flash 小模型
  const result = await llmClient.chat(userId, "quiz_judge", {
    modelSize: "small", // 使用 flash 小模型（判题任务轻量）
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  // 处理调用失败
  if (result.code !== 200) {
    console.error(TAG + " AI 判题调用失败: " + result.message);
    throw new Error("AI 判题调用失败: " + result.message);
  }

  // 解析 AI 返回的 JSON 内容
  const rawContent = result.message?.content;
  if (typeof rawContent !== "string" || !rawContent.trim()) {
    throw new Error("AI 判题未返回有效内容");
  }

  let judgeJson;
  try {
    judgeJson = JSON.parse(rawContent);
  } catch (err) {
    console.error(TAG + " AI 返回内容不是合法 JSON: " + rawContent.substring(0, 200));
    throw new Error("AI 判题返回内容不是合法 JSON");
  }

  const percent = normalizePercent(judgeJson?.percent);
  const commentary = normalizeCommentary(judgeJson?.commentary);

  console.log(TAG + " AI 判题完成 — percent: " + percent + ", commentary: " + commentary.substring(0, 30));

  return { percent, commentary };
}

module.exports = { judgeEssayByAI };
