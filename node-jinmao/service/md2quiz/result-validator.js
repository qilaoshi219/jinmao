// ==================== AI 输出结果校验器 ====================
// 职责：校验 DeepSeek 流式输出的 JSON 内容是否合法、题型数量是否匹配
// 移植自 test/金毛刷题/backend/src/modules/markdown-json-test/result-validator.ts

const TAG = "[md2quiz_validator]";

/** 合法的题型标识 */
const VALID_QUESTION_TYPES = [
  "single",
  "multiple",
  "judge",
  "fill",
  "short_answer",
];

/**
 * 创建初始题型计数对象
 * @returns {import("./types").GenerationConfig}
 */
function createInitialGeneratedCount() {
  return {
    single: 0,
    multiple: 0,
    judge: 0,
    fill: 0,
    shortAnswer: 0,
  };
}

/**
 * 清洗 JSON 文本：去除可能的 markdown 代码块标记
 * @param {string} rawText
 * @returns {string}
 */
function sanitizeJsonText(rawText) {
  return rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * 校验题型字符串是否合法
 * @param {unknown} type
 * @returns {type is import("./types").QuestionType}
 */
function isValidQuestionType(type) {
  return (
    typeof type === "string" && VALID_QUESTION_TYPES.includes(type)
  );
}

/**
 * 校验单道题目结构
 * @param {unknown} question  - 待校验的题目对象
 * @param {number} index      - 题目序号（0-based）
 * @returns {boolean} 校验通过返回 true，否则抛出异常
 */
function validateQuestionShape(question, index) {
  if (!question || typeof question !== "object") {
    throw new Error(`第 ${index + 1} 题不是对象结构。`);
  }

  /** @type {Record<string, unknown>} */
  const q = question;

  if (!isValidQuestionType(q.type)) {
    throw new Error(`第 ${index + 1} 题的 type 不合法。`);
  }

  if (typeof q.question !== "string" || !q.question.trim()) {
    throw new Error(`第 ${index + 1} 题缺少有效 question。`);
  }

  if (!("answer" in q)) {
    throw new Error(`第 ${index + 1} 题缺少 answer 字段。`);
  }

  // 选择题必须有 options 数组
  if (
    (q.type === "single" || q.type === "multiple") &&
    (!Array.isArray(q.options) || q.options.length === 0)
  ) {
    throw new Error(`第 ${index + 1} 题为选择题，但 options 不是有效数组。`);
  }

  // explanation 必须是字符串（可选）
  if ("explanation" in q && typeof q.explanation !== "string") {
    throw new Error(`第 ${index + 1} 题的 explanation 必须是字符串。`);
  }

  return true;
}

/**
 * 统计各题型的生成数量
 * @param {import("./types").QuestionRecord[]} questions
 * @returns {import("./types").GenerationConfig}
 */
function countGeneratedQuestions(questions) {
  const generatedCount = createInitialGeneratedCount();

  questions.forEach((question) => {
    if (question.type === "single") generatedCount.single += 1;
    if (question.type === "multiple") generatedCount.multiple += 1;
    if (question.type === "judge") generatedCount.judge += 1;
    if (question.type === "fill") generatedCount.fill += 1;
    if (question.type === "short_answer") generatedCount.shortAnswer += 1;
  });

  return generatedCount;
}

/**
 * 从解析后的 JSON 中提取 questions 数组
 * 支持顶层数组 或 { questions: [...] } 两种格式
 * @param {unknown} parsedValue
 * @returns {unknown[]}
 */
function getQuestionsFromParsedJson(parsedValue) {
  // 顶层数组
  if (Array.isArray(parsedValue)) {
    return parsedValue;
  }

  // { questions: [...] } 格式
  if (
    parsedValue &&
    typeof parsedValue === "object" &&
    "questions" in parsedValue &&
    Array.isArray(parsedValue.questions)
  ) {
    return parsedValue.questions;
  }

  throw new Error(
    "模型返回的 JSON 顶层必须是数组，或包含 questions 数组的对象。"
  );
}

/**
 * 校验模型输出的完整流程
 * @param {Object} params
 * @param {string} params.rawText                  - AI 原始输出文本
 * @param {import("./types").GenerationConfig} params.generationConfig - 题型配额
 * @returns {import("./types").ValidationResult}
 */
function validateQuestionBlockResult({ rawText, generationConfig }) {
  console.log(TAG + " 开始校验模型输出...");

  try {
    // 1. 清洗 JSON 文本
    const sanitizedJsonText = sanitizeJsonText(rawText);

    // 2. 解析 JSON
    const parsedValue = JSON.parse(sanitizedJsonText);

    // 3. 提取 questions 数组
    const questions = getQuestionsFromParsedJson(parsedValue);

    // 4. 逐题校验结构
    questions.forEach((question, index) => {
      validateQuestionShape(question, index);
    });

    /** @type {import("./types").QuestionRecord[]} */
    const normalizedQuestions = questions;

    // 5. 统计各题型数量
    const generatedCountByType = countGeneratedQuestions(normalizedQuestions);

    // 6. 校验各题型数量是否与配额匹配
    const checks = [
      { key: "single", label: "single" },
      { key: "multiple", label: "multiple" },
      { key: "judge", label: "judge" },
      { key: "fill", label: "fill" },
      { key: "shortAnswer", label: "short_answer" },
    ];

    for (const { key, label } of checks) {
      if (generatedCountByType[key] !== generationConfig[key]) {
        throw new Error(
          `${label} 数量不匹配，期望 ${generationConfig[key]}，实际 ${generatedCountByType[key]}。`
        );
      }
    }

    console.log(TAG + " 模型输出校验通过", {
      generatedCountByType,
    });

    return {
      success: true,
      questions: normalizedQuestions,
      generatedCountByType,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "模型输出校验失败。";

    console.warn(TAG + " 模型输出校验失败", { message });

    return {
      success: false,
      message,
    };
  }
}

module.exports = { validateQuestionBlockResult };
