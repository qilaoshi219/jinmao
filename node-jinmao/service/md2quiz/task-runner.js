// ==================== MD→JSON 任务执行器 ====================
// 职责：核心执行器 — 分块 → 流式调用 DeepSeek → 校验 → 入库 → 更新进度
// 适配变更：不调用旧的 importQuestionBankByJson，而是向 task 中预创建的 textbook/exam 写入题目
// 移植自 test/金毛刷题/backend/src/modules/markdown-json-test/task-runner.ts

const fs = require("fs");
const path = require("path");
const prisma = require("../../utils/prisma");
const quizRepo = require("../../repo/quiz_repo");
const { recordTokenUsage } = require("../../utils/billing");
const { chunkMarkdownByLineThreshold } = require("./chunker");
const { requestDeepseekJsonCompletionStream } = require("./deepseek-client");
const { validateQuestionBlockResult } = require("./result-validator");
const { updateTask } = require("./task-store");

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
async function generateQuestionsForChunk({ taskId, promptTemplate, chunk, generationConfig }) {
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
      completionResult = await requestDeepseekJsonCompletionStream(messages, {
        onDelta(deltaText) {
          currentChunkStreamed += deltaText.length;
          pendingStreamDelta += deltaText.length;
          flushPendingStream(false);
        },
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
 * 执行 MD→JSON 任务
 * 流程：加载提示词 → 分块 → 逐块生成题目 → 合并 → 导入 → 完成
 *
 * @param {string} taskId              - 任务 ID
 * @param {string} markdownContent     - Markdown 文本内容
 * @param {bigint} textbookId          - 预创建的题库 ID
 * @param {bigint} examId              - 预创建的试卷 ID
 */
async function runMarkdownJsonTask(taskId, markdownContent, textbookId, examId) {
  console.log(TAG + " ========== 任务开始执行 ==========", { taskId });

  try {
    // ===== 阶段 1：加载提示词 =====
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

    // ===== 阶段 2：分块 =====
    const chunks = chunkMarkdownByLineThreshold(markdownContent);

    updateTaskProgress(
      taskId,
      {
        chunkCount: chunks.length,
        currentPhase: "processing_chunks",
        lastMessage: `提示词加载完成，文本已切分为 ${chunks.length} 个块。`,
      },
      `提示词加载完成，文本已切分为 ${chunks.length} 个块。`
    );

    // ===== 阶段 3：逐块生成题目 =====
    /** @type {import("./types").QuestionRecord[]} */
    const mergedQuestions = [];
    let totalGeneratedCountByType = createInitialGeneratedCount();

    for (const chunk of chunks) {
      const generationResult = await generateQuestionsForChunk({
        taskId,
        promptTemplate,
        chunk,
        generationConfig: getCurrentTask(taskId).generationConfig,
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
        lastMessage: `已完成 ${t.completedChunkCount + 1}/${chunks.length} 个块。`,
        recentEvents: appendRecentEvent(
          t,
          `第 ${chunk.index} 块完成，当前已完成 ${t.completedChunkCount + 1}/${chunks.length} 块。`
        ),
        updatedAt: new Date().toISOString(),
      }));
    }

    // ===== 阶段 4：导入题目 =====
    const totalQuestionCount = mergedQuestions.length;

    updateTaskProgress(
      taskId,
      {
        importStatus: "importing",
        currentPhase: "importing_questions",
        mergedQuestionCount: totalQuestionCount,
        importedCount: 0,
        lastMessage: `题目生成完成，共 ${totalQuestionCount} 道题，开始入库。`,
      },
      `题目生成完成，共 ${totalQuestionCount} 道题，开始入库。`
    );

    const { importedCount, failedCount } = await importQuestionsToTextbook({
      textbookId,
      examId,
      questions: mergedQuestions,
    });

    // ===== 阶段 5：清理并完成 =====
    if (importedCount === 0) {
      // 全部导入失败，清理空教材
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

    // 更新计数 + 清除 generatingTaskId
    await quizRepo.updateQuestionCounts(textbookId, examId, importedCount);

    await prisma.quizTextbook.update({
      where: { id: textbookId },
      data: { generatingTaskId: null },
    });

    /** @type {import("./types").ImportResult} */
    const importResult = {
      textbookId: textbookId.toString(),
      examId: examId.toString(),
      textbookName: "", // 从 task 中获取
      examName: "",
      totalCount: totalQuestionCount,
      importedCount,
      failedCount,
    };

    // 从任务中获取名称
    updateTask(taskId, (t) => {
      importResult.textbookName = t.textbookName;
      importResult.examName = t.examName;

      return {
        ...t,
        status: "completed",
        importStatus: "imported",
        completedChunkCount: chunks.length,
        totalGeneratedCountByType,
        mergedQuestionCount: totalQuestionCount,
        importedCount,
        currentPhase: "completed",
        importResult,
        lastMessage: `任务完成，成功导入 ${importedCount} 题，失败 ${failedCount} 题。`,
        recentEvents: appendRecentEvent(
          t,
          `任务完成，成功导入 ${importedCount} 题，失败 ${failedCount} 题。`
        ),
        updatedAt: new Date().toISOString(),
      };
    });

    console.log(TAG + " ========== 任务执行完成 ==========", {
      taskId,
      totalQuestionCount,
      importedCount,
      failedCount,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "任务执行失败。";

    console.error(TAG + " ========== 任务执行失败 ==========", {
      taskId,
      message,
    });

    // 清除 generatingTaskId（任务失败也清除）
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
      lastMessage: `任务失败：${message}`,
      recentEvents: appendRecentEvent(t, `任务失败：${message}`),
      updatedAt: new Date().toISOString(),
    }));
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

module.exports = { runMarkdownJsonTask };
