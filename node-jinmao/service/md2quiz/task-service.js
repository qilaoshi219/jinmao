// ==================== MD→JSON 任务服务 ====================
// 职责：创建/查询/列出任务 + 生成前端轮询进度数据
// 移植自 test/金毛刷题/backend/src/modules/markdown-json-test/task-service.ts

const crypto = require("crypto");
const prisma = require("../../utils/prisma");
const quizRepo = require("../../repo/quiz_repo");
const { createTask, getTask, listTasksByOwner } = require("./task-store");
const { runMarkdownJsonTask } = require("./task-runner");

const TAG = "[md2quiz_service]";

// ==================== 终端状态常量 ====================
/** 终端任务状态列表 */
const TERMINAL_STATUSES = ["completed", "failed"];

/**
 * 计算文本行数
 * @param {string} text
 * @returns {number}
 */
function getLineCount(text) {
  if (!text) return 0;
  return text.replace(/\r\n/g, "\n").split("\n").length;
}

// ==================== 任务 CRUD ====================

/**
 * 创建 MD→JSON 生成任务
 * 流程：校验参数 → 创建 QuizTextbook + QuizExam → 创建任务实体 → 异步启动执行器
 *
 * @param {Object} payload
 * @param {string} payload.fileName         - 源文件名
 * @param {string} payload.markdownContent  - Markdown 文本内容
 * @param {string} payload.textbookName     - 题库名称
 * @param {string} payload.examName         - 试卷名称
 * @param {string} [payload.description]    - 题库描述
 * @param {import("./types").GenerationConfig} payload.generationConfig - 题型配额
 * @param {string} userId                    - 用户 ID
 * @returns {Promise<import("./types").TaskEntity>}
 */
async function createMd2QuizTask(payload, userId) {
  console.log(TAG + " 创建任务开始 — fileName: " + payload.fileName + ", userId: " + userId);

  // 1. 立即在 DB 中创建 QuizTextbook + QuizExam（0 题）
  const { textbookId, examId } = await quizRepo.createTextbookAndExam(
    payload.textbookName.trim(),
    payload.examName.trim(),
    userId,
    payload.description?.trim() || null,
    null // generatingTaskId 稍后由任务实体设置
  );

  console.log(TAG + " 预创建教材和试卷完成 — textbookId: " + textbookId + ", examId: " + examId);

  // 2. 生成任务 ID
  const taskId = crypto.randomUUID();

  // 3. 更新 textbook 的 generatingTaskId
  await prisma.quizTextbook.update({
    where: { id: textbookId },
    data: { generatingTaskId: taskId },
  });

  // 4. 构建任务实体
  const now = new Date().toISOString();

  /** @type {import("./types").TaskEntity} */
  const taskEntity = {
    taskId,
    ownerUserId: userId,
    status: "pending",
    importStatus: "pending",
    fileName: payload.fileName,
    textbookName: payload.textbookName.trim(),
    examName: payload.examName.trim(),
    description: payload.description?.trim() || "",
    textbookId: textbookId.toString(),
    examId: examId.toString(),
    totalLength: payload.markdownContent.length,
    totalLineCount: getLineCount(payload.markdownContent),
    chunkCount: 0,
    completedChunkCount: 0,
    chunkRanges: [],
    generationConfig: payload.generationConfig,
    currentPhase: "pending",
    lastMessage: "任务已创建，等待异步执行。",
    streamedCharacterCount: 0,
    currentChunkStreamedCharacterCount: 0,
    recentEvents: [
      {
        timestamp: now,
        message: "任务已创建，等待异步执行。",
      },
    ],
    updatedAt: now,
  };

  // 5. 写入内存存储 + 持久化
  createTask(taskEntity);

  // 6. 异步启动任务执行器（传入 markdownContent + pre-created IDs）
  setTimeout(() => {
    runMarkdownJsonTask(taskId, payload.markdownContent, textbookId, examId)
      .catch((err) => {
        console.error(TAG + " 任务执行器异常退出: " + err.message);
      });
  }, 0);

  console.log(TAG + " 任务创建完成 — taskId: " + taskId + ", textbookId: " + textbookId);

  return taskEntity;
}

/**
 * 根据 taskId 和 userId 获取任务详情
 * @param {string} taskId
 * @param {string} ownerUserId  - 用于权限校验
 * @returns {import("./types").TaskEntity}
 */
function getMd2QuizTask(taskId, ownerUserId) {
  const task = getTask(taskId);

  if (!task) {
    throw new Error(`任务 ${taskId} 不存在或已失效。`);
  }

  if (task.ownerUserId !== ownerUserId) {
    throw new Error(`任务 ${taskId} 不存在或已失效。`);
  }

  return task;
}

/**
 * 列出指定用户的任务列表
 * @param {string} ownerUserId
 * @param {number} [limit=50]
 * @returns {import("./types").TaskEntity[]}
 */
function listMd2QuizTasks(ownerUserId, limit = 50) {
  return listTasksByOwner(ownerUserId, limit);
}

/**
 * 获取任务进度数据（供前端轮询使用，对齐 GET /book/:id/progress 风格）
 * @param {string} taskId
 * @param {string} ownerUserId
 * @returns {import("./types").TaskProgress}
 */
function getMd2QuizTaskProgress(taskId, ownerUserId) {
  const task = getMd2QuizTask(taskId, ownerUserId);

  const isTerminal = TERMINAL_STATUSES.includes(task.status);

  /** @type {import("./types").TaskProgress} */
  const progress = {
    taskId: task.taskId,
    textbookId: task.textbookId,
    status: task.status,
    isTerminal,
    progress: {
      phase: task.currentPhase || "pending",
    },
  };

  // 分块进度
  if (task.chunkCount > 0) {
    progress.progress.chunkProgress = {
      current: task.completedChunkCount,
      total: task.chunkCount,
    };
  }

  // 导入进度（有题目总数时显示）
  if (task.importStatus === "importing" && task.mergedQuestionCount) {
    progress.progress.importProgress = {
      current: task.importedCount || 0,
      total: task.mergedQuestionCount,
    };
  }

  // 流式字符数
  if (task.streamedCharacterCount > 0) {
    progress.progress.streamedCharacterCount = task.streamedCharacterCount;
  }

  // 终端状态时返回导入结果
  if (isTerminal && task.importResult) {
    progress.progress.importResult = task.importResult;
  }

  return progress;
}

module.exports = {
  createMd2QuizTask,
  getMd2QuizTask,
  listMd2QuizTasks,
  getMd2QuizTaskProgress,
};
