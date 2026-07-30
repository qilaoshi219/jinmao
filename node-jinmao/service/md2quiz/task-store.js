// ==================== 任务存储模块 ====================
// 职责：维护任务内存 Map + 防抖 JSON 文件持久化 + 服务重启恢复
// 合并移植自 task-store.ts + task-persistence.ts

const fs = require("fs");
const path = require("path");
const { publishTaskSnapshot } = require("./task-stream-broker");

const TAG = "[md2quiz_store]";

// ==================== 常量 ====================
/** 持久化文件路径 */
const PERSISTENCE_FILE = path.resolve(__dirname, "../../data/md2quiz-tasks.json");

/** 最多保留的历史任务数 */
const TASK_HISTORY_LIMIT = 200;

/** 防抖延迟（毫秒） */
const PERSIST_DEBOUNCE_MS = 300;

/** 流式输出日志节流阈值（字符数） */
const TASK_STREAM_LOG_THROTTLE_STEP = 1000;

// ==================== 内存存储 ====================

/** @type {Map<string, import("./types").TaskEntity>} */
const taskStore = new Map();

/** @type {Map<string, Object>} 日志节流状态 */
const taskLogState = new Map();

/** 防抖定时器 */
let persistTimer = null;
/** 当前持久化 Promise */
let persistPromise = null;

// ==================== 持久化 ====================

/**
 * 将任务转为持久化记录（排除大体积字段 mergedJsonData / mergedJsonText）
 * @param {import("./types").TaskEntity} task
 * @returns {Object}
 */
function toPersistedRecord(task) {
  return {
    taskId: task.taskId,
    ownerUserId: task.ownerUserId,
    status: task.status,
    importStatus: task.importStatus,
    fileName: task.fileName,
    textbookName: task.textbookName,
    examName: task.examName,
    description: task.description,
    textbookId: task.textbookId,
    examId: task.examId,
    mode: task.mode || "generate",
    totalLength: task.totalLength,
    totalLineCount: task.totalLineCount,
    chunkCount: task.chunkCount,
    completedChunkCount: task.completedChunkCount,
    chunkRanges: task.chunkRanges,
    generationConfig: task.generationConfig,
    totalGeneratedCountByType: task.totalGeneratedCountByType || null,
    errorMessage: task.errorMessage || null,
    currentChunkIndex: task.currentChunkIndex || null,
    currentAttempt: task.currentAttempt || null,
    currentPhase: task.currentPhase || null,
    lastMessage: task.lastMessage || null,
    streamedCharacterCount: task.streamedCharacterCount,
    currentChunkStreamedCharacterCount: task.currentChunkStreamedCharacterCount,
    importResult: task.importResult || null,
    recentEvents: task.recentEvents || [],
    updatedAt: task.updatedAt || null,
  };
}

/**
 * 从文件读取持久化任务数据
 * @returns {Promise<Object[]>}
 */
function readPersistedTasks() {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(PERSISTENCE_FILE)) {
        console.log(TAG + " 持久化文件不存在，将使用空白任务存储启动。");
        return resolve([]);
      }

      const rawData = fs.readFileSync(PERSISTENCE_FILE, "utf-8");
      const parsed = JSON.parse(rawData);
      if (!Array.isArray(parsed)) {
        console.warn(TAG + " 持久化文件格式异常，将使用空白任务存储启动。");
        return resolve([]);
      }

      console.log(TAG + " 从持久化文件读取到 " + parsed.length + " 条任务记录。");
      resolve(parsed);
    } catch (err) {
      console.error(TAG + " 读取持久化文件失败: " + err.message);
      resolve([]);
    }
  });
}

/**
 * 按更新时间降序排列
 * @param {import("./types").TaskEntity[]} tasks
 * @returns {import("./types").TaskEntity[]}
 */
function sortTasksByUpdatedAtDesc(tasks) {
  const sorted = tasks.slice();
  sorted.sort((a, b) => {
    const aTime = new Date(a.updatedAt || 0).getTime();
    const bTime = new Date(b.updatedAt || 0).getTime();
    return bTime - aTime;
  });
  return sorted;
}

/**
 * 将内存中的任务写入持久化文件
 */
async function flushPersistedTasks() {
  const orderedTasks = sortTasksByUpdatedAtDesc(
    Array.from(taskStore.values())
  );
  const persistedRecords = orderedTasks
    .slice(0, TASK_HISTORY_LIMIT)
    .map((task) => toPersistedRecord(task));

  // 写入临时文件再重命名，避免写入过程中服务崩溃导致文件损坏
  const tempFile = PERSISTENCE_FILE + ".tmp";
  await fs.promises.writeFile(tempFile, JSON.stringify(persistedRecords, null, 2), "utf-8");
  await fs.promises.rename(tempFile, PERSISTENCE_FILE);
}

/**
 * 调度防抖持久化
 */
function schedulePersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistPromise = flushPersistedTasks().catch((error) => {
      console.error(TAG + " 任务持久化写盘失败: " + error.message);
    });
  }, PERSIST_DEBOUNCE_MS);
}

// ==================== 服务重启恢复 ====================

/**
 * 将服务重启前未完成的任务标记为 failed
 * @param {Object} persistedTask - 持久化任务记录
 * @returns {import("./types").TaskEntity}
 */
function markInterruptedTaskAsFailed(persistedTask) {
  const isInterrupted =
    persistedTask.status === "pending" ||
    persistedTask.status === "running" ||
    persistedTask.importStatus === "pending" ||
    persistedTask.importStatus === "importing";

  if (!isInterrupted) {
    return { ...persistedTask };
  }

  const interruptedAt = new Date().toISOString();

  console.log(TAG + " 服务重启，将未完成任务标记为 failed: " + persistedTask.taskId);

  return {
    ...persistedTask,
    status: "failed",
    importStatus:
      persistedTask.importStatus === "imported" ? "imported" : "failed",
    currentPhase: "server_restarted",
    errorMessage: "服务已重启，未完成的后台生成任务已中断，请重新发起。",
    lastMessage: "服务已重启，未完成的后台生成任务已中断，请重新发起。",
    recentEvents: [
      {
        timestamp: interruptedAt,
        message:
          "服务已重启，未完成的后台生成任务已中断，请重新发起。",
      },
      ...(persistedTask.recentEvents || []),
    ].slice(0, 12),
    updatedAt: interruptedAt,
  };
}

// ==================== 公开 API ====================

/**
 * 初始化任务存储（从持久化文件恢复）
 * 应在 app.js 启动时调用
 */
async function initializeTaskStore() {
  const persistedTasks = await readPersistedTasks();

  taskStore.clear();

  persistedTasks.forEach((task) => {
    const normalizedTask = markInterruptedTaskAsFailed(task);
    taskStore.set(normalizedTask.taskId, normalizedTask);
  });

  console.log(TAG + " 任务历史初始化完成，共 " + taskStore.size + " 条记录。");

  if (persistedTasks.length > 0) {
    schedulePersist();
  }
}

/**
 * 创建任务并写入内存存储
 * @param {import("./types").TaskEntity} task
 */
function createTask(task) {
  console.log(TAG + " 写入任务初始状态", {
    taskId: task.taskId,
    status: task.status,
  });

  taskStore.set(task.taskId, task);
  taskLogState.set(task.taskId, {
    currentPhase: task.currentPhase,
    status: task.status,
    importStatus: task.importStatus,
    streamedCharacterCount: task.streamedCharacterCount,
  });
  schedulePersist();
  publishTaskSnapshot(task); // 广播给内部 SSE 订阅者
}

/**
 * 根据 taskId 获取任务
 * @param {string} taskId
 * @returns {import("./types").TaskEntity|undefined}
 */
function getTask(taskId) {
  return taskStore.get(taskId);
}

/**
 * 列出指定用户的任务
 * @param {string} ownerUserId
 * @param {number} [limit=50]
 * @returns {import("./types").TaskEntity[]}
 */
function listTasksByOwner(ownerUserId, limit = 50) {
  const matchedTasks = Array.from(taskStore.values()).filter(
    (task) => task.ownerUserId === ownerUserId
  );
  return sortTasksByUpdatedAtDesc(matchedTasks).slice(0, Math.max(1, limit));
}

/**
 * 更新任务（使用 updater 函数操作当前任务并返回新状态）
 * @param {string} taskId
 * @param {(task: import("./types").TaskEntity) => import("./types").TaskEntity} updater
 * @returns {import("./types").TaskEntity}
 */
function updateTask(taskId, updater) {
  const currentTask = taskStore.get(taskId);

  if (!currentTask) {
    throw new Error(`任务 ${taskId} 不存在。`);
  }

  const nextTask = updater(currentTask);
  taskStore.set(taskId, nextTask);

  // 日志节流：只在阶段/状态变化时输出
  const previousLogState = taskLogState.get(taskId);
  const shouldLog =
    !previousLogState ||
    previousLogState.currentPhase !== nextTask.currentPhase ||
    previousLogState.status !== nextTask.status ||
    previousLogState.importStatus !== nextTask.importStatus ||
    nextTask.streamedCharacterCount -
      previousLogState.streamedCharacterCount >=
      TASK_STREAM_LOG_THROTTLE_STEP;

  if (shouldLog) {
    console.log(TAG + " 任务状态已更新", {
      taskId,
      status: nextTask.status,
      importStatus: nextTask.importStatus,
      completedChunkCount: nextTask.completedChunkCount,
      chunkCount: nextTask.chunkCount,
      currentPhase: nextTask.currentPhase,
      streamedCharacterCount: nextTask.streamedCharacterCount,
      lastMessage: nextTask.lastMessage,
    });
  }

  taskLogState.set(taskId, {
    currentPhase: nextTask.currentPhase,
    status: nextTask.status,
    importStatus: nextTask.importStatus,
    streamedCharacterCount: shouldLog
      ? nextTask.streamedCharacterCount
      : previousLogState?.streamedCharacterCount ??
        nextTask.streamedCharacterCount,
  });

  schedulePersist();
  publishTaskSnapshot(nextTask); // 广播给内部 SSE 订阅者

  return nextTask;
}

module.exports = {
  initializeTaskStore,
  createTask,
  getTask,
  listTasksByOwner,
  updateTask,
};
