// ==================== 题库导入业务逻辑 ====================
// 职责：解析外部 JSON 题目并事务性入库
// 移植自金毛刷题 test/金毛刷题/backend/src/modules/textbooks/parser.ts 和 service.ts

const quizRepo = require("../repo/quiz_repo");

// 日志前缀
const TAG = "[quiz_import]";

// ==================== 题型映射 ====================

/**
 * 将前端题型名称映射为数据库枚举值
 * @param {string} type - 前端题型标识
 * @returns {string|null} 数据库枚举值或 null（非法）
 */
function mapQuestionType(type) {
  switch (type) {
    case "single": return "SINGLE";
    case "multiple": return "MULTIPLE";
    case "judge": return "JUDGE";
    case "fill": return "FILL";
    case "essay":
    case "short_answer": return "ESSAY";
    default: return null;
  }
}

// ==================== 选项解析 ====================

/**
 * 解析选择题选项数组
 * 支持 "A. 选项内容"、"A、选项内容"、"A) 选项内容" 等格式
 * @param {string[]} options - 原始选项数组
 * @returns {Array<{key: string, value: string}>|null}
 */
function parseChoiceOptions(options) {
  const parsed = [];

  for (const option of options) {
    const match = option.match(/^\s*([A-Za-z])[\.\、\)\s]+(.+?)\s*$/);
    if (!match) return null; // 格式不合法

    parsed.push({
      key: match[1].toUpperCase(),
      value: match[2].trim(),
    });
  }

  // 检查是否有空值
  if (parsed.some((o) => !o.value)) return null;

  return parsed;
}

// ==================== 答案归一化 ====================

/**
 * 归一化单选题答案（期望单字母 A-Z）
 */
function normalizeSingleAnswer(answer) {
  if (typeof answer !== "string") return null;
  const normalized = answer.trim().toUpperCase();
  return /^[A-Z]$/.test(normalized) ? normalized : null;
}

/**
 * 归一化多选题答案（期望字母数组或逗号分隔字符串）
 */
function normalizeMultipleAnswer(answer) {
  if (!Array.isArray(answer) || answer.length === 0) return null;

  const normalized = answer
    .map((item) => (typeof item === "string" ? item.trim().toUpperCase() : ""))
    .filter(Boolean);

  if (normalized.length === 0 || normalized.some((item) => !/^[A-Z]$/.test(item))) return null;

  // 去重后用逗号连接
  return Array.from(new Set(normalized)).join(",");
}

/**
 * 归一化判断题答案（转"正确"或"错误"）
 */
function normalizeJudgeAnswer(answer) {
  if (typeof answer === "boolean") return answer ? "正确" : "错误";
  if (typeof answer !== "string") return null;

  const normalized = answer.trim();
  if (["正确", "对", "true", "TRUE", "True"].includes(normalized)) return "正确";
  if (["错误", "错", "false", "FALSE", "False"].includes(normalized)) return "错误";

  return null;
}

/**
 * 归一化填空题答案
 */
function normalizeFillAnswer(answer) {
  if (typeof answer === "string" && answer.trim()) return answer.trim();

  if (Array.isArray(answer) && answer.length > 0) {
    const normalized = answer.map((item) => String(item).trim()).filter(Boolean);
    if (normalized.length === 0) return null;
    return JSON.stringify(normalized);
  }

  return null;
}

/**
 * 归一化简答题答案
 */
function normalizeEssayAnswer(answer) {
  if (typeof answer !== "string" || !answer.trim()) return null;
  return answer.trim();
}

// ==================== 题目解析主函数 ====================

/**
 * 解析单道导入题目
 * @param {Object} question - 原始题目数据
 * @param {number} index - 题目序号（1-based）
 * @returns {{success: boolean, data?: Object, failure?: {index: number, id?: string, reason: string}}}
 */
function parseImportedQuestion(question, index) {
  // 基本校验
  if (!question || typeof question !== "object" || Array.isArray(question)) {
    return {
      success: false,
      failure: { index, reason: "题目必须是对象结构。" },
    };
  }

  // 题型校验
  const mappedType = mapQuestionType(question.type);
  if (!mappedType) {
    return {
      success: false,
      failure: {
        index,
        id: question.id,
        reason: "题型不合法，仅支持 single/multiple/judge/fill/short_answer/essay。",
      },
    };
  }

  // 题干不能为空
  if (typeof question.question !== "string" || !question.question.trim()) {
    return {
      success: false,
      failure: { index, id: question.id, reason: "题干不能为空。" },
    };
  }

  let normalizedOptions = null;
  let normalizedAnswer = null;

  // 选择题需要选项数组
  if (mappedType === "SINGLE" || mappedType === "MULTIPLE") {
    if (!Array.isArray(question.options) || question.options.length === 0) {
      return {
        success: false,
        failure: { index, id: question.id, reason: "选择题必须提供 options 数组。" },
      };
    }

    normalizedOptions = parseChoiceOptions(question.options);
    if (!normalizedOptions) {
      return {
        success: false,
        failure: { index, id: question.id, reason: "选项格式不合法，请使用 \"A. 选项内容\" 形式。" },
      };
    }
  }

  // 按题型归一化答案
  switch (mappedType) {
    case "SINGLE":
      normalizedAnswer = normalizeSingleAnswer(question.answer);
      break;
    case "MULTIPLE":
      normalizedAnswer = normalizeMultipleAnswer(question.answer);
      break;
    case "JUDGE":
      normalizedAnswer = normalizeJudgeAnswer(question.answer);
      break;
    case "FILL":
      normalizedAnswer = normalizeFillAnswer(question.answer);
      break;
    case "ESSAY":
      normalizedAnswer = normalizeEssayAnswer(question.answer);
      break;
  }

  if (!normalizedAnswer) {
    return {
      success: false,
      failure: { index, id: question.id, reason: "答案格式不合法，无法完成归一化处理。" },
    };
  }

  // 解析成功
  return {
    success: true,
    data: {
      type: mappedType,
      content: question.question.trim(),
      options: normalizedOptions,
      answer: normalizedAnswer,
      analysis: typeof question.explanation === "string" && question.explanation.trim()
        ? question.explanation.trim()
        : null,
      sortOrder: index,
    },
  };
}

// ==================== 批量导入主函数 ====================

/**
 * 批量导入题库（JSON 格式）
 * 流程：创建教材和试卷 → 逐题解析 → 批量写入 → 更新计数
 *
 * @param {Object} payload - 导入数据
 * @param {string} payload.textbookName - 题库名称
 * @param {string} payload.examName - 试卷名称
 * @param {string} payload.userId - 用户ID
 * @param {string} [payload.description] - 题库描述
 * @param {Array<Object>} payload.questions - 题目数组
 * @returns {Promise<Object>} 导入结果
 */
async function importQuestionBankByJson(payload) {
  const { textbookName, examName, userId, description, questions } = payload;

  console.log(TAG + " 开始执行题库导入 — 题库: " + textbookName + ", 试卷: " + examName + ", 题目数: " + questions.length);

  // 1. 创建教材和试卷基础数据
  const { textbookId, examId } = await quizRepo.createTextbookAndExam(textbookName, examName, userId, description);

  console.log(TAG + " 教材和试卷基础数据创建完成 — textbookId: " + textbookId + ", examId: " + examId);

  // 2. 逐题解析
  const failures = [];
  const parsedQuestions = [];

  for (let i = 0; i < questions.length; i++) {
    const result = parseImportedQuestion(questions[i], i + 1);

    if (result.success) {
      parsedQuestions.push(result.data);
    } else {
      failures.push(result.failure);
    }
  }

  console.log(TAG + " 解析完成 — 成功: " + parsedQuestions.length + " 题, 失败: " + failures.length + " 题");

  // 3. 批量写入数据库
  const importedCount = await quizRepo.batchCreateQuestions(textbookId, examId, parsedQuestions);

  // 4. 如果没有成功导入任何题目，清理空数据
  if (importedCount === 0) {
    await quizRepo.cleanupEmptyImport(textbookId, examId);

    console.warn(TAG + " 导入结束，没有成功入库的题目");

    return {
      success: false,
      message: "所有题目均导入失败，系统已自动清理空教材和空试卷。",
      data: {
        textbookId: textbookId.toString(),
        examId: examId.toString(),
        textbookName,
        examName,
        totalCount: questions.length,
        importedCount: 0,
        failedCount: failures.length,
        failures,
      },
    };
  }

  // 5. 更新计数
  await quizRepo.updateQuestionCounts(textbookId, examId, importedCount);

  const result = {
    textbookId: textbookId.toString(),
    examId: examId.toString(),
    textbookName,
    examName,
    totalCount: questions.length,
    importedCount,
    failedCount: failures.length,
    failures,
  };

  console.log(TAG + " 题库导入完成 — 成功: " + importedCount + " 题, 失败: " + failures.length + " 题");

  return {
    success: true,
    message: "导入完成，成功 " + importedCount + " 题，失败 " + failures.length + " 题。",
    data: result,
  };
}

module.exports = {
  parseImportedQuestion,
  importQuestionBankByJson,
};
