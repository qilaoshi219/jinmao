// ==================== MD→JSON 任务执行器 ====================
// 职责：核心执行器 — 分块 → 流式调用 DeepSeek → 校验 → 入库 → 更新进度
// 适配变更：不调用旧的 importQuestionBankByJson，而是向 task 中预创建的 textbook/exam 写入题目
// 移植自 test/金毛刷题/backend/src/modules/markdown-json-test/task-runner.ts

const fs = require("fs");
const path = require("path");
const prisma = require("../../utils/prisma");
const quizRepo = require("../../repo/quiz_repo");
const { recordTokenUsage } = require("../../utils/billing");
const { chatStream } = require("../../utils/llm_client");
const { chunkMarkdownByLineThreshold } = require("./chunker");
const { validateQuestionBlockResult } = require("./result-validator");
const { updateTask } = require("./task-store");
// 新增：AI 无损分块模块
const { splitQuizIntoChunks } = require("./quiz-splitter");
const { processAllChunks } = require("./quiz-chunk-processor");

const TAG = "[md2quiz_runner]";

// ==================== 配置常量 ====================

/** 每块最大重试次数 */
const CHUNK_RETRY_LIMIT = 3;

/** 流式进度刷新间隔（毫秒） */
const STREAM_PROGRESS_FLUSH_INTERVAL_MS = 800;

/** 流式进度字符步长 */
const STREAM_PROGRESS_FLUSH_CHARACTER_STEP = 240;

// ==================== 提示词加载 ====================

/** 缓存已加载的提示词 */
let cachedPromptTemplate = "";

/**
 * 获取提示词模板文件路径
 * @returns {string}
 */
function getPromptTemplatePath() {
  return path.resolve(__dirname, "../../config/md2quiz_prompt.md");
}

/**
 * 加载提示词模板（带缓存）
 * @returns {Promise<string>}
 */
async function loadPromptTemplate() {
  if (cachedPromptTemplate) return cachedPromptTemplate;

  const promptPath = getPromptTemplatePath();
  console.log(TAG + " 读取提示词模板: " + promptPath);

  const text = await fs.promises.readFile(promptPath, "utf-8");

  if (!text.trim()) {
    throw new Error("题库转换提示词文件为空，无法创建生成任务。");
  }

  cachedPromptTemplate = text;
  console.log(TAG + " 提示词模板读取完成，长度: " + text.length + " 字符。");
  return cachedPromptTemplate;
}

// ==================== 辅助函数 ====================

/**
 * 创建初始题型计数
 * @returns {import("./types").GenerationConfig}
 */
function createInitialGeneratedCount() {
  return { single: 0, multiple: 0, judge: 0, fill: 0, shortAnswer: 0 };
}

/**
 * 累加题型计数
 * @param {import("./types").GenerationConfig} base
 * @param {import("./types").GenerationConfig} delta
 * @returns {import("./types").GenerationConfig}
 */
function addGeneratedCount(base, delta) {
  return {
    single: base.single + delta.single,
    multiple: base.multiple + delta.multiple,
    judge: base.judge + delta.judge,
    fill: base.fill + delta.fill,
    shortAnswer: base.shortAnswer + delta.shortAnswer,
  };
}

/**
 * 向事件列表添加新事件（最多保留 12 条）
 * @param {import("./types").TaskEntity} task
 * @param {string} message
 * @returns {Array<{timestamp: string, message: string}>}
 */
function appendRecentEvent(task, message) {
  return [
    { timestamp: new Date().toISOString(), message },
    ...(task.recentEvents || []),
  ].slice(0, 12);
}

/**
 * 更新任务进度（便捷包装）
 * @param {string} taskId
 * @param {Partial<import("./types").TaskEntity>} patch
 * @param {string} [eventMessage]
 */
function updateTaskProgress(taskId, patch, eventMessage) {
  updateTask(taskId, (task) => ({
    ...task,
    ...patch,
    recentEvents: eventMessage
      ? appendRecentEvent(task, eventMessage)
      : task.recentEvents,
    updatedAt: new Date().toISOString(),
  }));
}

// ==================== 提示词构建 ====================

/**
 * 构建首个块的系统提示词
 * @param {Object} params
 * @param {string} params.promptTemplate   - 系统提示词模板
 * @param {import("./types").ChunkRecord} params.chunk - 当前块
 * @param {import("./types").GenerationConfig} params.generationConfig
 * @returns {string}
 */
function buildChunkPrompt({ promptTemplate, chunk, generationConfig }) {
  return `【系统提示词】
${promptTemplate}

【任务要求】
请仅基于以下文本块生成题目。
必须严格输出以下配额：
- single: ${generationConfig.single}
- multiple: ${generationConfig.multiple}
- judge: ${generationConfig.judge}
- fill: ${generationConfig.fill}
- short_answer: ${generationConfig.shortAnswer}
数量不足也不要少生成，必须按配额输出。
请使用 JSON 输出优化能力，仅返回一个合法 JSON 对象，格式为：
{
  "questions": [ ... ]
}
不要返回解释、标题、代码块标记或额外说明。

【当前文本块，行号 ${chunk.startLine}-${chunk.endLine}】
${chunk.content}`;
}

/**
 * 构建重试纠正提示词
 * @param {Object} params
 */
function buildCorrectionPrompt({ errorMessage, chunk, generationConfig }) {
  return `你刚才的输出不符合要求，请严格纠正后重新输出。
错误原因：${errorMessage}
请继续只基于当前文本块（行号 ${chunk.startLine}-${chunk.endLine}）重新生成。
本块必须严格满足以下配额：
- single: ${generationConfig.single}
- multiple: ${generationConfig.multiple}
- judge: ${generationConfig.judge}
- fill: ${generationConfig.fill}
- short_answer: ${generationConfig.shortAnswer}
仍然只允许返回如下 JSON 对象：
{
  "questions": [ ... ]
}`;
}

// ==================== 单块生成 ====================

/**
 * 为单个文本块生成题目（含重试逻辑）
 * @param {Object} params
 * @param {string} params.taskId
 * @param {string} params.promptTemplate
 * @param {import("./types").ChunkRecord} params.chunk
 * @param {import("./types").GenerationConfig} params.generationConfig
 * @returns {Promise<import("./types").ValidationSuccess>}
 */
async function generateQuestionsForChunk({ taskId, promptTemplate, chunk, generationConfig, userId }) {
  /** @type {import("./types").DeepseekMessage[]} */
  const messages = [
    {
      role: "system",
      content:
        "你是一个严格的题库 JSON 生成器，必须遵守用户给定的输出结构和数量要求。",
    },
    {
      role: "user",
      content: buildChunkPrompt({ promptTemplate, chunk, generationConfig }),
    },
  ];

  let lastValidationErrorMessage = "";

  for (let attempt = 0; attempt <= CHUNK_RETRY_LIMIT; attempt++) {
    console.log(TAG + " 开始生成单块题目", {
      chunkIndex: chunk.index,
      attempt: attempt + 1,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
    });

    updateTaskProgress(
      taskId,
      {
        currentChunkIndex: chunk.index,
        currentAttempt: attempt + 1,
        currentPhase: attempt === 0 ? "calling_model" : "retrying_chunk",
        currentChunkStreamedCharacterCount: 0,
        lastMessage: `正在调用 DeepSeek，处理第 ${chunk.index} 块第 ${attempt + 1} 次尝试。`,
      },
      `第 ${chunk.index} 块开始第 ${attempt + 1} 次模型调用。`
    );

    // 流式输出进度控制
    let pendingStreamDelta = 0;
    let currentChunkStreamed = 0;
    let lastStreamFlushAt = 0;

    function flushPendingStream(force) {
      if (pendingStreamDelta <= 0) return;

      const now = Date.now();
      const shouldFlush =
        force ||
        now - lastStreamFlushAt >= STREAM_PROGRESS_FLUSH_INTERVAL_MS ||
        pendingStreamDelta >= STREAM_PROGRESS_FLUSH_CHARACTER_STEP;

      if (!shouldFlush) return;

      updateTask(taskId, (t) => ({
        ...t,
        currentPhase: "calling_model",
        streamedCharacterCount:
          t.streamedCharacterCount + pendingStreamDelta,
        currentChunkStreamedCharacterCount: currentChunkStreamed,
        lastMessage: `第 ${chunk.index} 块正在输出，已累计 ${t.streamedCharacterCount + pendingStreamDelta} 个字符。`,
        updatedAt: new Date().toISOString(),
      }));

      pendingStreamDelta = 0;
      lastStreamFlushAt = now;
    }

    let completionResult;
    try {
      completionResult = await chatStream(userId, "md2quiz_generate", {
        modelSize: "big",
        messages,
        onDelta(deltaText) {
          currentChunkStreamed += deltaText.length;
          pendingStreamDelta += deltaText.length;
          flushPendingStream(false);
        },
        response_format: { type: "json_object" },
      });
      flushPendingStream(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "DeepSeek 调用失败。";

      console.error(TAG + " DeepSeek 调用失败: " + message);

      updateTaskProgress(
        taskId,
        {
          currentPhase: "calling_model_failed",
          lastMessage: `第 ${chunk.index} 块第 ${attempt + 1} 次模型调用失败：${message}`,
        },
        `第 ${chunk.index} 块第 ${attempt + 1} 次模型调用失败：${message}`
      );

      if (attempt === CHUNK_RETRY_LIMIT) {
        throw error;
      }

      continue; // 未达重试上限，继续下一次重试
    }

    // 更新状态为校验中
    updateTaskProgress(
      taskId,
      {
        currentPhase: "validating_result",
        currentChunkStreamedCharacterCount: currentChunkStreamed,
        lastMessage: `第 ${chunk.index} 块模型调用成功，开始校验结果。`,
      },
      `第 ${chunk.index} 块第 ${attempt + 1} 次模型调用成功。`
    );

    // 校验结果
    const validationResult = validateQuestionBlockResult({
      rawText: completionResult.content,
      generationConfig,
    });

    if (validationResult.success) {
      updateTaskProgress(
        taskId,
        {
          currentPhase: "chunk_validated",
          lastMessage: `第 ${chunk.index} 块校验通过。`,
        },
        `第 ${chunk.index} 块第 ${attempt + 1} 次校验通过。`
      );
      return validationResult;
    }

    // 校验失败
    lastValidationErrorMessage = validationResult.message;

    updateTaskProgress(
      taskId,
      {
        currentPhase:
          attempt === CHUNK_RETRY_LIMIT
            ? "validation_failed"
            : "retrying_chunk",
        lastMessage: `第 ${chunk.index} 块校验失败：${validationResult.message}`,
      },
      `第 ${chunk.index} 块第 ${attempt + 1} 次校验失败：${validationResult.message}`
    );

    if (attempt === CHUNK_RETRY_LIMIT) {
      throw new Error(
        `第 ${chunk.index} 块（行号 ${chunk.startLine}-${chunk.endLine}）在重试后仍未通过校验：${lastValidationErrorMessage}`
      );
    }

    // 将失败的输出加入对话历史，请求纠正
    messages.push({
      role: "assistant",
      content: completionResult.content,
    });
    messages.push({
      role: "user",
      content: buildCorrectionPrompt({
        errorMessage: validationResult.message,
        chunk,
        generationConfig,
      }),
    });
  }
}

// ==================== 答案归一化（5 种题型） ====================

/**
 * 归一化答案值（从答案区原始文本转为标准格式）
 * 处理来自 AI 答案块（type: "answers"）的原始答案文本
 * 不同题型有不同的归一化规则
 *
 * @param {string} rawAnswer - 答案区原始文本（如 "B"、"ACD"、"正确"、"H2O"）
 * @param {string} questionType - 题型标识：single/multiple/judge/fill/short_answer
 * @returns {string} 归一化后的答案字符串
 */
function normalizeAnswerFromRaw(rawAnswer, questionType) {
  if (!rawAnswer || typeof rawAnswer !== "string") return "";
  const cleaned = rawAnswer.trim();

  switch (questionType) {
    case "single": {
      // 单选：提取单个字母 "B"/"b"/"(B)" → "B"
      const match = cleaned.match(/[A-Ea-e]/);
      return match ? match[0].toUpperCase() : cleaned;
    }

    case "multiple": {
      // 多选："ACD"→"A,C,D"、"A, C, D"→"A,C,D"、"A.C.D"→"A,C,D"
      const letters = cleaned.match(/[A-Ea-e]/g);
      if (letters && letters.length >= 2) {
        return letters.map(l => l.toUpperCase()).join(",");
      }
      if (letters && letters.length === 1) {
        return letters[0].toUpperCase();
      }
      return cleaned;
    }

    case "judge": {
      // 判断："正确/对/√/✓/True/T/Yes/Y/是" → "正确"
      if (/^[✓✔√对正TtYy是]|正确|TRUE|true|YES|yes/.test(cleaned)) return "正确";
      // "错误/错/×/✗/False/F/No/N/否" → "错误"
      if (/^[✗✘×错FfNn否]|错误|FALSE|false|NO|no/.test(cleaned)) return "错误";
      // 无法识别时保留原文并输出警告
      console.warn(TAG + " 判断答案格式无法识别: \"" + cleaned + "\"，保留原文");
      return cleaned;
    }

    case "fill":
    case "short_answer": {
      // 填空/简答：去除题号前缀（"4. H2O"→"H2O"），保留原文
      const noNumber = cleaned.replace(/^\d+[\.\、\．\s]+/, "").trim();
      return noNumber || cleaned;
    }

    default: {
      return cleaned;
    }
  }
}

// ==================== 合并器 ====================

/**
 * 合并所有块的处理结果，按题号填入答案
 * 输入来自分段器+处理器产生的 questionMap / answerMap / completeQuestions
 * 输出归一化后的完整题目列表
 *
 * @param {Map<number, Object>} questionMap - 题号 → 题目对象（无答案）
 * @param {Map<string, string>} answerMap - 题号字符串 → 答案原文
 * @param {Object[]} completeQuestions - 已有完整答案的题目
 * @returns {{ mergedQuestions: Object[], mergeWarnings: string[] }}
 */
function mergeResults(questionMap, answerMap, completeQuestions) {
  // 1. 先加入完整题目（AI 已经填好答案的）
  const mergedQuestions = [...completeQuestions];
  const usedAnswerIds = new Set();
  const mergeWarnings = [];

  // ---- 1.5 预处理：按题型对 questionMap 建索引，支持题型前缀匹配 ----
  // AI 有时会在答案块中使用题型前缀键（如"单5""多3""判7""简1"），
  // 这是因为它看到不同类型的题有重复编号（都从1开始），
  // 这里建立 (type, localIndex) → questionObj 的映射来解决此问题
  /** @type {Record<string, {id: number, q: Object}[]>} */
  const questionsByType = {};
  for (const [id, q] of questionMap.entries()) {
    const t = q.type || "short_answer";
    if (!questionsByType[t]) questionsByType[t] = [];
    questionsByType[t].push({ id, q });
  }
  // 每种题型内按 id 排序，保证"第 X 道单选题"的语义正确
  for (const t of Object.keys(questionsByType)) {
    questionsByType[t].sort((a, b) => a.id - b.id);
  }

  // 题型前缀 → 标准 type 映射表（同时支持中文缩写和英文全名，防御 AI 返回不同格式）
  const PREFIX_TO_TYPE = {
    "单": "single",
    "多": "multiple",
    "判": "judge",
    "简": "short_answer",
    "填": "fill",
    // 英文类型名（AI 可能使用英文作为前缀，如 "single5"）
    "single": "single",
    "multiple": "multiple",
    "judge": "judge",
    "fill": "fill",
    "short_answer": "short_answer"
  };

  /**
   * 将带题型前缀的答案键转换为纯数字 ID
   * 例如 "单5" → 在 single 题中按 id 排序后第 5 道题的 id
   * @param {string} key - 原始答案键（可能含题型前缀）
   * @param {string} answer - 答案值
   * @returns {number|null} 匹配到的题目 id，失败返回 null
   */
  function resolvePrefixedKey(key, answer) {
    if (/^\d+$/.test(key)) {
      // 纯数字键，直接返回（不需要前缀解析）
      return parseInt(key, 10);
    }

    for (const [prefix, type] of Object.entries(PREFIX_TO_TYPE)) {
      if (!key.startsWith(prefix)) continue;
      const numStr = key.slice(prefix.length);
      if (!/^\d+$/.test(numStr)) continue;

      const localIndex = parseInt(numStr, 10);
      const typedQuestions = questionsByType[type];
      if (!typedQuestions || localIndex < 1 || localIndex > typedQuestions.length) {
        // 该题型下没有足够的题目（题目可能未被识别或尚未解析）
        console.warn(TAG + " 前缀键 \"" + key + "\" (type=" + type + ", idx=" + localIndex + ") 在该题型下无对应题目（共 " + (typedQuestions?.length || 0) + " 题），跳过匹配");
        return null;
      }

      const matched = typedQuestions[localIndex - 1]; // 0-based 索引
      console.log(TAG + " 题型前缀匹配: \"" + key + "\"(\"" + answer + "\") → 题目 id=" + matched.id + " (type=" + type + ")");
      return matched.id;
    }

    // 无法解析的前缀键
    mergeWarnings.push("答案键 \"" + key + "\" 格式无法识别，既非纯数字也非已知题型前缀");
    return null;
  }

  // ---- 2. 预处理 answerMap：将题型前缀键解析为纯数字 ID ----
  /** @type {Map<number, string>} */
  const resolvedAnswers = new Map();
  for (const [rawKey, answer] of answerMap.entries()) {
    const resolvedId = resolvePrefixedKey(rawKey, answer);
    if (resolvedId !== null) {
      resolvedAnswers.set(resolvedId, answer);
    }
  }

  // ---- 3. 将答案按题号填入题目 ----
  for (const [id, q] of questionMap.entries()) {
    // 优先从解析后的答案中查找，兜底用原始 answerMap（兼容旧格式）
    let rawAnswer = resolvedAnswers.get(id);
    if (rawAnswer === undefined) {
      rawAnswer = answerMap.get(String(id));
    }

    if (rawAnswer !== undefined) {
      // 找到匹配答案 → 归一化后填入
      q.answer = normalizeAnswerFromRaw(rawAnswer, q.type || "short_answer");
      usedAnswerIds.add(String(id));
    } else {
      // 无匹配答案 → 留空并记录警告
      mergeWarnings.push("题目 #" + id + "（类型: " + (q.type || "未知") + "）未找到对应答案");
      q.answer = "";
    }
    mergedQuestions.push(q);
  }

  // ---- 4. 检查未被使用的答案（有答案但无题目） ----
  for (const [id, answer] of answerMap.entries()) {
    // 如果该答案键已经被前缀解析匹配过，跳过（不再报"未使用"警告）
    const resolvedId = resolvePrefixedKey(id, answer);
    if (resolvedId !== null && usedAnswerIds.has(String(resolvedId))) {
      usedAnswerIds.add(id); // 标记原始键，防止下面重复报错
    }
  }
  for (const [id, answer] of answerMap.entries()) {
    if (!usedAnswerIds.has(id)) {
      mergeWarnings.push("答案 #" + id + "（\"" + answer + "\"）未匹配到对应题目");
    }
  }

  // ---- 5. 按 id 排序 ----
  mergedQuestions.sort((a, b) => (a.id || 0) - (b.id || 0));

  // ---- 6. 入库前最终校验：选择题选项完整性 ----
  for (const q of mergedQuestions) {
    if ((q.type === "single" || q.type === "multiple") &&
        (!Array.isArray(q.options) || q.options.length < 2)) {
      mergeWarnings.push("题目 #" + (q.id || "?") + " 是选择题但选项不足（" + (q.options?.length || 0) + " 个）");
    }
  }

  console.log(TAG + " 合并完成 — 总计 " + mergedQuestions.length + " 题（完整题 " + completeQuestions.length + " + 匹配题 " + (mergedQuestions.length - completeQuestions.length) + "）");
  // 统计真正未使用的答案（不在 usedAnswerIds 中的原始 answerMap key）
  const unusedKeys = [];
  for (const key of answerMap.keys()) {
    if (!usedAnswerIds.has(key)) unusedKeys.push(key);
  }
  console.log(TAG + " 答案匹配: " + usedAnswerIds.size + " 条已追踪, " + unusedKeys.length + " 条未使用");
  console.log(TAG + " 合并警告: " + mergeWarnings.length + " 条");

  return { mergedQuestions, mergeWarnings };
}

// ==================== 题目导入 ====================

/**
 * 向预创建的 textbook/exam 中批量导入题目
 * @param {Object} params
 * @param {bigint} params.textbookId
 * @param {bigint} params.examId
 * @param {import("./types").QuestionRecord[]} params.questions
 * @returns {Promise<{importedCount: number, failedCount: number}>}
 */
async function importQuestionsToTextbook({ textbookId, examId, questions }) {
  console.log(TAG + " 开始向 textbook " + textbookId + " 导入 " + questions.length + " 道题目...");

  let importedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    try {
      // 题型映射
      const typeMap = {
        single: "SINGLE",
        multiple: "MULTIPLE",
        judge: "JUDGE",
        fill: "FILL",
        short_answer: "ESSAY",
      };
      const dbType = typeMap[q.type] || "ESSAY";

      // 构建 Prisma 写入数据
      /** @type {import('@prisma/client').Prisma.QuizQuestionCreateInput} */
      const questionData = {
        examId,
        textbookId,
        type: dbType,
        content: q.question.trim(),
        answer: normalizeAnswer(q),
        analysis: q.explanation || null,
        sortOrder: i + 1,
      };

      // 选择题需要 options JSON
      if (
        (q.type === "single" || q.type === "multiple") &&
        Array.isArray(q.options)
      ) {
        questionData.options = q.options;
      }

      await prisma.quizQuestion.create({ data: questionData });
      importedCount++;
    } catch (err) {
      console.error(TAG + " 题目 " + (i + 1) + " 导入失败: " + err.message);
      failedCount++;
    }
  }

  console.log(TAG + " 导入完成 — 成功: " + importedCount + ", 失败: " + failedCount);
  return { importedCount, failedCount };
}

/**
 * 归一化答案格式
 * @param {import("./types").QuestionRecord} q
 * @returns {string}
 */
function normalizeAnswer(q) {
  // 单选：返回单个字母
  if (q.type === "single" && typeof q.answer === "string") {
    return q.answer.trim().toUpperCase();
  }

  // 多选：返回逗号分隔的字母
  if (q.type === "multiple") {
    if (Array.isArray(q.answer)) {
      return q.answer
        .map((a) => (typeof a === "string" ? a.trim().toUpperCase() : ""))
        .filter(Boolean)
        .join(",");
    }
    if (typeof q.answer === "string") {
      return q.answer.trim().toUpperCase();
    }
  }

  // 判断
  if (q.type === "judge") {
    if (typeof q.answer === "boolean") return q.answer ? "正确" : "错误";
    if (typeof q.answer === "string") {
      const n = q.answer.trim();
      if (["正确", "对", "true", "TRUE", "True"].includes(n)) return "正确";
      if (["错误", "错", "false", "FALSE", "False"].includes(n)) return "错误";
    }
  }

  // 填空 / 简答
  if (typeof q.answer === "string") return q.answer.trim();
  if (Array.isArray(q.answer)) return JSON.stringify(q.answer);

  return String(q.answer);
}

// ==================== 主执行函数 ====================

/**
 * 执行 MD→JSON 任务（generate 模式：分块、按配额生成）
 *
 * @param {string} taskId              - 任务 ID
 * @param {string} markdownContent     - Markdown 文本内容
 * @param {bigint} textbookId          - 预创建的题库 ID
 * @param {bigint} examId              - 预创建的试卷 ID
 */
async function runMarkdownJsonTask(taskId, markdownContent, textbookId, examId, userId) {
  console.log(TAG + " [generate] ========== 任务开始执行 ==========", { taskId });

  try {
    // ===== 阶段 1：加载提示词（保持不变） =====
    updateTaskProgress(
      taskId,
      {
        status: "running",
        currentPhase: "loading_prompt",
        lastMessage: "正在加载提示词模板。",
      },
      "任务开始执行，正在加载提示词模板。"
    );

    const promptTemplate = await loadPromptTemplate();

    // ===== 阶段 2-4：尝试 AI 无损分块流水线（分段器 → 处理器 → 合并器） =====
    let mergedQuestions = [];
    let totalGeneratedCountByType = createInitialGeneratedCount();
    let allPipelineWarnings = [];
    let usedNewPipeline = false;

    try {
      // ---- 阶段 2：AI 无损分段器 ----
      updateTaskProgress(
        taskId,
        { currentPhase: "ai_splitting", lastMessage: "AI 正在分析题库结构，寻找完整语义边界..." },
        "开始 AI 无损分段。"
      );

      const chunks = await splitQuizIntoChunks(markdownContent, userId);

      updateTaskProgress(
        taskId,
        {
          chunkCount: chunks.length,
          currentPhase: "processing_chunks",
          lastMessage: "AI 分段完成，共 " + chunks.length + " 个完整语义块，开始格式化题目。",
        },
        "AI 无损分段完成，共 " + chunks.length + " 个块。"
      );

      // ---- 阶段 3：分块处理器 ----
      const { questionMap, answerMap, completeQuestions, allWarnings } =
        await processAllChunks(chunks, userId);

      allPipelineWarnings.push(...allWarnings);

      // ---- 阶段 4：合并器 ----
      const { mergedQuestions: merged, mergeWarnings } = mergeResults(
        questionMap, answerMap, completeQuestions
      );
      mergedQuestions = merged;
      allPipelineWarnings.push(...mergeWarnings);

      // 统计题型数量
      for (const q of mergedQuestions) {
        if (q.type === "single") totalGeneratedCountByType.single++;
        else if (q.type === "multiple") totalGeneratedCountByType.multiple++;
        else if (q.type === "judge") totalGeneratedCountByType.judge++;
        else if (q.type === "fill") totalGeneratedCountByType.fill++;
        else if (q.type === "short_answer") totalGeneratedCountByType.shortAnswer++;
      }

      usedNewPipeline = true;
      console.log(TAG + " AI 无损分块流水线执行成功。" + 
        " 题目: " + mergedQuestions.length + 
        " 题, 警告: " + allPipelineWarnings.length + " 条");

    } catch (pipelineError) {
      // ---- 降级：回退到原有盲切逻辑 ----
      console.warn(TAG + " AI 无损分块流水线失败: " + pipelineError.message + "，降级到原有盲切逻辑。");
      allPipelineWarnings.push("AI 无损分块失败，已降级到盲切逻辑: " + pipelineError.message);
    }

    // ---- 降级路径：使用原有 chunker 盲切逻辑 ----
    if (!usedNewPipeline) {
      updateTaskProgress(
        taskId,
        { currentPhase: "fallback_chunking", lastMessage: "使用传统分块方式处理..." },
        "降级到传统分块方式。"
      );

      const chunks = chunkMarkdownByLineThreshold(markdownContent);

      updateTaskProgress(
        taskId,
        {
          chunkCount: chunks.length,
          currentPhase: "processing_chunks",
          lastMessage: "文本已切分为 " + chunks.length + " 个块（降级模式）。",
        },
        "文本已切分为 " + chunks.length + " 个块（降级模式）。"
      );

      for (const chunk of chunks) {
        const generationResult = await generateQuestionsForChunk({
          taskId,
          promptTemplate,
          chunk,
          generationConfig: getCurrentTask(taskId).generationConfig,
          userId,
        });

        totalGeneratedCountByType = addGeneratedCount(
          totalGeneratedCountByType,
          generationResult.generatedCountByType
        );
        mergedQuestions.push(...generationResult.questions);

        updateTask(taskId, (t) => ({
          ...t,
          completedChunkCount: t.completedChunkCount + 1,
          totalGeneratedCountByType,
          currentPhase: "processing_chunks",
          currentChunkStreamedCharacterCount: 0,
          lastMessage: "已完成 " + (t.completedChunkCount + 1) + "/" + chunks.length + " 个块（降级模式）。",
          recentEvents: appendRecentEvent(
            t,
            "第 " + chunk.index + " 块完成（降级模式），当前已完成 " + (t.completedChunkCount + 1) + "/" + chunks.length + " 块。"
          ),
          updatedAt: new Date().toISOString(),
        }));
      }
    }

    // ===== 阶段 5：导入题目（新老流水线统一走这里） =====
    const totalQuestionCount = mergedQuestions.length;

    updateTaskProgress(
      taskId,
      {
        importStatus: "importing",
        currentPhase: "importing_questions",
        mergedQuestionCount: totalQuestionCount,
        importedCount: 0,
        lastMessage: "题目生成完成，共 " + totalQuestionCount + " 道题，开始入库。",
      },
      "题目生成完成，共 " + totalQuestionCount + " 道题，开始入库。"
    );

    const { importedCount, failedCount } = await importQuestionsToTextbook({
      textbookId,
      examId,
      questions: mergedQuestions,
    });

    // ===== 阶段 6：清理并完成 =====
    if (importedCount === 0) {
      await quizRepo.cleanupEmptyImport(textbookId, examId);

      updateTaskProgress(
        taskId,
        {
          status: "failed",
          importStatus: "failed",
          currentPhase: "failed",
          importedCount: 0,
          lastMessage: "所有题目导入失败，空教材已自动清理。",
        },
        "所有题目导入失败，空教材已自动清理。"
      );

      throw new Error("所有题目导入失败。");
    }

    await quizRepo.updateQuestionCounts(textbookId, examId, importedCount);

    await prisma.quizTextbook.update({
      where: { id: textbookId },
      data: { generatingTaskId: null },
    });

    /** @type {import("./types").ImportResult} */
    const importResult = {
      textbookId: textbookId.toString(),
      examId: examId.toString(),
      textbookName: "",
      examName: "",
      totalCount: totalQuestionCount,
      importedCount,
      failedCount,
    };

    updateTask(taskId, (t) => {
      importResult.textbookName = t.textbookName;
      importResult.examName = t.examName;

      // 将 pipeline 警告合并到最近事件中
      const warningEvent = allPipelineWarnings.length > 0
        ? "任务完成，共 " + allPipelineWarnings.length + " 条警告。"
        : "任务完成。";

      return {
        ...t,
        status: "completed",
        importStatus: "imported",
        completedChunkCount: t.chunkCount || mergedQuestions.length,
        totalGeneratedCountByType,
        mergedQuestionCount: totalQuestionCount,
        importedCount,
        currentPhase: "completed",
        importResult,
        lastMessage: "任务完成，成功导入 " + importedCount + " 题，失败 " + failedCount + " 题。" + (allPipelineWarnings.length > 0 ? "（" + allPipelineWarnings.length + " 条警告）" : ""),
        recentEvents: appendRecentEvent(t, warningEvent),
        updatedAt: new Date().toISOString(),
      };
    });

    // 输出警告汇总到控制台（不刷屏，一次性输出）
    if (allPipelineWarnings.length > 0) {
      console.warn(TAG + " ========== 任务警告汇总（共 " + allPipelineWarnings.length + " 条）==========");
      allPipelineWarnings.forEach((w, idx) => console.warn(TAG + " [" + (idx + 1) + "] " + w));
    }

    console.log(TAG + " ========== 任务执行完成 ==========", {
      taskId,
      totalQuestionCount,
      importedCount,
      failedCount,
      pipeline: usedNewPipeline ? "AI无损分块" : "传统盲切(降级)",
      warnings: allPipelineWarnings.length,
    });

    // ========== 后置余额检查：任务完成后若余额为负则锁定用户 ==========
    const { lockUserIfNegative } = require("../../utils/balance");
    lockUserIfNegative(userId).then(locked => {
      if (locked) {
        console.log(TAG + " ⚠️ 用户 " + userId + " 余额已为负，已锁定！请尽快充值。");
      }
    }).catch(err => {
      console.error(TAG + " 后置余额检查异常: " + err.message);
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "任务执行失败。";

    console.error(TAG + " ========== 任务执行失败 ==========", {
      taskId,
      message,
    });

    try {
      await prisma.quizTextbook.update({
        where: { id: textbookId },
        data: { generatingTaskId: null },
      });
    } catch (_) {
      // 静默处理
    }

    updateTask(taskId, (t) => ({
      ...t,
      status: t.status === "completed" ? "completed" : "failed",
      importStatus:
        t.importStatus === "imported" ? "imported" : "failed",
      errorMessage: message,
      currentPhase: "failed",
      lastMessage: "任务失败：" + message,
      recentEvents: appendRecentEvent(t, "任务失败：" + message),
      updatedAt: new Date().toISOString(),
    }));

    // ========== 后置余额检查：即使任务失败，已产生的 AI 费用也可能导致余额变负 ==========
    const { lockUserIfNegative } = require("../../utils/balance");
    lockUserIfNegative(userId).catch(() => {});
  }
}

/**
 * 获取当前任务（内部使用，不校验权限）
 * @param {string} taskId
 */
function getCurrentTask(taskId) {
  const { getTask } = require("./task-store");
  const task = getTask(taskId);
  if (!task) throw new Error(`任务 ${taskId} 不存在。`);
  return task;
}

module.exports = { runMarkdownJsonTask, mergeResults, normalizeAnswerFromRaw };
