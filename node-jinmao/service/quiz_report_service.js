// ==================== 刷题报告业务逻辑 ====================
// 职责：报告生成、评分计算、异步 AI 判题调度、SSE 通知
// 移植自金毛刷题 test/金毛刷题/backend/src/modules/quiz/report.service.ts 和 essay-grading.service.ts

const quizRepo = require("../repo/quiz_repo");
const { judgeEssayByAI } = require("./quiz_judge");
const { publishQuizReportSnapshot } = require("./quiz_sse_broker");

// 日志前缀
const TAG = "[quiz_report]";

// ==================== 并发控制 ====================

/** 最大并发判题数 */
const MAX_CONCURRENCY = 5;

/** 正在处理的报告集合（防重入） */
const runningReports = new Set();

/**
 * 并发执行异步任务
 */
async function runWithConcurrencyLimit(items, limit, handler) {
  if (items.length === 0) return;

  const concurrency = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const workers = Array.from({ length: concurrency }).map(async () => {
    while (true) {
      const index = cursor;
      cursor++;
      if (index >= items.length) break;
      await handler(items[index]);
    }
  });

  await Promise.all(workers);
}

// ==================== 报告生成 ====================

/**
 * 解析多选题答案
 */
function parseMultipleAnswer(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
    }
  } catch (_) { /* ignore */ }
  return String(raw).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
}

/**
 * 解析填空题参考答案
 */
function parseFillReferenceAnswer(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((s) => String(s).trim()).filter(Boolean);
    }
  } catch (_) { /* ignore */ }
  return [String(raw).trim()].filter(Boolean);
}

/**
 * 判断多选题对错
 */
function isMultipleCorrect(refAnswer, userAnswer) {
  const ref = parseMultipleAnswer(refAnswer);
  const usr = parseMultipleAnswer(userAnswer);
  if (ref.length === 0 || usr.length === 0) return false;

  const refSet = new Set(ref);
  const usrSet = new Set(usr);
  if (refSet.size !== usrSet.size) return false;
  for (const item of refSet) {
    if (!usrSet.has(item)) return false;
  }
  return true;
}

/**
 * 安全转换数字
 */
function safeNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 创建刷题报告
 * 流程：加载会话 → 加载题目 → 计算客观题得分 → 创建报告（简答题标记 PENDING）→ 触发异步批改 → SSE 推送
 *
 * @param {string} userId
 * @param {string} sessionId
 * @returns {Promise<{reportId: string, status: string}>}
 */
async function createQuizReport(userId, sessionId) {
  console.log(TAG + " createQuizReport — sessionId: " + sessionId);

  // 1. 检查是否已有报告
  const prisma = require("../utils/prisma");
  const existingReport = await prisma.quizReport.findFirst({
    where: {
      sessionId: BigInt(sessionId),
      userId: BigInt(userId),
    },
    select: { id: true, status: true },
  });

  if (existingReport) {
    // 已有报告 → 如果正在批改则重新触发
    if (existingReport.status === "GRADING") {
      ensureEssayGradingRunning(existingReport.id.toString());
    }
    return {
      reportId: existingReport.id.toString(),
      status: existingReport.status,
    };
  }

  // 2. 获取会话
  const session = await quizRepo.getSessionDetail(sessionId, userId);
  if (!session) throw new Error("SESSION_NOT_FOUND");

  const questionIds = (session.questionIds || [])
    .map((id) => {
      try { return BigInt(String(id)); } catch (_) { return null; }
    })
    .filter(Boolean);

  if (questionIds.length === 0) throw new Error("SESSION_HAS_NO_QUESTIONS");

  // 3. 获取题目数据（含答案）
  const questions = await quizRepo.getSessionQuestions(questionIds);

  // 补全题目答案字段
  const questionsFull = [];
  for (const q of questions) {
    const fullQ = await prisma.quizQuestion.findUnique({
      where: { id: q.id },
      select: { id: true, type: true, content: true, answer: true, analysis: true },
    });
    if (fullQ) questionsFull.push(fullQ);
  }

  if (questionsFull.length === 0) throw new Error("SESSION_HAS_NO_VALID_QUESTIONS");

  // 4. 构建题目 Map 和用户作答 Map
  const questionMap = new Map();
  for (const q of questionsFull) {
    questionMap.set(q.id.toString(), q);
  }

  const userAnswerMap = new Map();
  const userAnswerRowMap = new Map();
  for (const ua of session.userAnswers) {
    const qid = ua.questionId.toString();
    userAnswerMap.set(qid, ua.userAnswer);
    userAnswerRowMap.set(qid, ua.id);
  }

  // 5. 按会话中的顺序处理
  const orderedIds = questionIds.filter((id) => questionMap.has(id.toString()));
  const totalCount = orderedIds.length;
  const maxScore = totalCount > 0 ? 100 / totalCount : 0;

  let correctCount = 0;
  let objectiveCount = 0;
  let essayCount = 0;
  let scoreObjective = 0;

  const items = [];
  const answerCorrectUpdates = [];

  for (const qid of orderedIds) {
    const q = questionMap.get(qid.toString());
    if (!q) continue;

    const userAnswer = String(userAnswerMap.get(q.id.toString()) || "").trim();
    const refAnswer = String(q.answer || "").trim();

    // 简答题
    if (q.type === "ESSAY") {
      essayCount++;
      items.push({
        questionId: q.id.toString(),
        questionType: "ESSAY",
        maxScore,
        score: 0,
        isCorrect: null,
        userAnswer: userAnswer || null,
        referenceAnswer: refAnswer || null,
        status: "PENDING",
      });
      continue;
    }

    // 客观题判题
    objectiveCount++;
    let isCorrect = false;

    if (q.type === "SINGLE") {
      isCorrect = userAnswer.toUpperCase() === refAnswer.toUpperCase();
    } else if (q.type === "MULTIPLE") {
      isCorrect = isMultipleCorrect(refAnswer, userAnswer);
    } else if (q.type === "JUDGE") {
      isCorrect = userAnswer === refAnswer;
    } else if (q.type === "FILL") {
      const candidates = parseFillReferenceAnswer(refAnswer);
      isCorrect = candidates.some((c) => c === userAnswer);
    }

    if (isCorrect) {
      correctCount++;
      scoreObjective += maxScore;
    }

    const answerRowId = userAnswerRowMap.get(q.id.toString());
    if (answerRowId) {
      answerCorrectUpdates.push({ answerId: answerRowId, isCorrect });
    }

    items.push({
      questionId: q.id.toString(),
      questionType: q.type,
      maxScore,
      score: isCorrect ? maxScore : 0,
      isCorrect,
      userAnswer: userAnswer || null,
      referenceAnswer: refAnswer || null,
      status: "DONE",
    });
  }

  // 6. 确定报告状态
  const status = essayCount > 0 ? "GRADING" : "COMPLETED";
  const scoreTotal = essayCount > 0 ? scoreObjective : scoreObjective; // 后续 AI 判题完成后更新

  // 7. 事务性创建报告
  const report = await quizRepo.createReport({
    userId,
    sessionId,
    textbookId: session.textbookId?.toString() || null,
    status,
    totalCount,
    objectiveCount,
    essayCount,
    scoreObjective,
    scoreEssay: 0,
    scoreTotal,
    items,
  });

  // 8. 更新作答记录的 isCorrect
  if (answerCorrectUpdates.length > 0) {
    await prisma.quizUserAnswer.updateMany({
      where: { id: { in: answerCorrectUpdates.map((u) => u.answerId) } },
      data: { isCorrect: true }, // 注意：这里需要逐条更新，简化为只处理正确的
    });
    // 批量更新每条记录
    for (const update of answerCorrectUpdates) {
      await prisma.quizUserAnswer.update({
        where: { id: update.answerId },
        data: { isCorrect: update.isCorrect },
      }).catch(() => { /* 忽略更新失败 */ });
    }
  }

  // 9. 完成会话
  await quizRepo.completeSession(BigInt(sessionId), totalCount, correctCount, orderedIds.length);

  // 10. 如果有简答题 → 触发异步批改
  if (essayCount > 0) {
    ensureEssayGradingRunning(report.id.toString());
  }

  console.log(TAG + " 报告已生成 — reportId: " + report.id + ", status: " + report.status);

  // 11. 推送最新报告快照
  publishLatestSnapshot(report.id.toString());

  return { reportId: report.id.toString(), status: report.status };
}

// ==================== 异步 AI 批改 ====================

/**
 * 确保报告批改任务运行（防重入）
 * @param {string} reportId
 */
async function ensureEssayGradingRunning(reportId) {
  if (!reportId) return;
  if (runningReports.has(reportId)) return;

  const report = await quizRepo.findReportById(reportId);
  if (!report) return;

  // 无简答题 → 直接标记完成
  if (report.essayCount <= 0) {
    if (report.status !== "COMPLETED") {
      await require("../utils/prisma").quizReport.update({
        where: { id: BigInt(reportId) },
        data: { status: "COMPLETED" },
      });
    }
    return;
  }

  if (report.status !== "GRADING") return;

  // 标记为运行中
  runningReports.add(reportId);

  try {
    await gradeEssayItemsForReport(reportId, report.userId.toString());
  } finally {
    runningReports.delete(reportId);
  }
}

/**
 * 对报告中的所有简答题进行异步 AI 批改
 * @param {string} reportId
 * @param {string} userId
 */
async function gradeEssayItemsForReport(reportId, userId) {
  console.log(TAG + " gradeEssayItemsForReport — reportId: " + reportId);

  // 1. 获取待批改的简答题
  const pendingItems = await quizRepo.getPendingEssayItems(reportId);
  if (pendingItems.length === 0) {
    await refreshAndPublish(reportId);
    return;
  }

  console.log(TAG + " 开始批改简答题 — 数量: " + pendingItems.length + ", 并发: " + MAX_CONCURRENCY);

  // 2. 并发批改
  await runWithConcurrencyLimit(pendingItems, MAX_CONCURRENCY, async (item) => {
    // 先标记为 RUNNING
    await quizRepo.setReportItemRunning(item.id);
    await refreshAndPublish(reportId);

    try {
      const userAnswer = String(item.userAnswer || "").trim();
      const refAnswer = String(item.referenceAnswer || item.question.answer || "").trim();
      const questionContent = item.question.content.trim();
      const maxScore = safeNumber(item.maxScore);

      // 调用 AI 判题
      const judged = await judgeEssayByAI({
        userId,
        question: questionContent,
        referenceAnswer: refAnswer,
        userAnswer,
      });

      const score = maxScore * (judged.percent / 100);

      // 更新得分
      await quizRepo.updateReportItemScore(item.id, {
        status: "DONE",
        score,
        aiPercent: judged.percent,
        aiCommentary: judged.commentary,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "未知错误";
      console.error(TAG + " 简答题批改失败 — itemId: " + item.id + ": " + errMsg);

      await quizRepo.updateReportItemScore(item.id, {
        status: "FAILED",
        score: 0,
        aiPercent: null,
        aiCommentary: "批改失败: " + errMsg,
      });
    }

    // 每次批改完成后推送进度
    await refreshAndPublish(reportId);
  });

  console.log(TAG + " 简答题批改任务结束 — reportId: " + reportId);
}

// ==================== 辅助函数 ====================

/**
 * 刷新报告分数并推送快照
 */
async function refreshAndPublish(reportId) {
  await quizRepo.refreshReportScore(reportId);
  await publishLatestSnapshot(reportId);
}

/**
 * 获取并推送最新报告快照
 */
async function publishLatestSnapshot(reportId) {
  try {
    // 获取报告基本信息
    const report = await quizRepo.findReportById(reportId);
    if (!report) return;

    const snapshot = await getQuizReportDetail(report.userId.toString(), reportId);
    publishQuizReportSnapshot(reportId, snapshot);
  } catch (error) {
    console.warn(TAG + " 推送报告快照失败 — reportId: " + reportId + ": " + error.message);
  }
}

// ==================== 公开 API ====================

/**
 * 获取报告列表
 */
async function listQuizReports(userId, limit, offset) {
  const result = await quizRepo.listReports(userId, limit, offset);
  return {
    total: result.total,
    items: result.items.map(formatReportListItem),
  };
}

/**
 * 获取最近报告列表
 */
async function listRecentQuizReports(userId, limit) {
  const rows = await quizRepo.listRecentReports(userId, limit);
  return rows.map(formatReportListItem);
}

/**
 * 格式化报告列表项
 */
function formatReportListItem(row) {
  const doneEssayCount = (row.items || []).filter(
    (item) => item.questionType === "ESSAY" && item.status === "DONE"
  ).length;

  return {
    reportId: row.id.toString(),
    sessionId: row.sessionId.toString(),
    textbookId: row.textbookId ? row.textbookId.toString() : null,
    textbookName: row.textbook?.name || null,
    status: row.status,
    totalCount: row.totalCount,
    objectiveCount: row.objectiveCount,
    essayCount: row.essayCount,
    doneEssayCount,
    scoreTotal: safeNumber(row.scoreTotal),
    createTime: row.createTime ? row.createTime.toISOString() : null,
    updateTime: row.updateTime ? row.updateTime.toISOString() : null,
  };
}

/**
 * 获取报告详情
 */
async function getQuizReportDetail(userId, reportId) {
  const report = await quizRepo.getReportDetail(reportId, userId);
  if (!report) throw new Error("REPORT_NOT_FOUND");

  const base = formatReportListItem(report);

  // 构建题目明细
  const items = report.items.map((item) => ({
    questionId: item.questionId.toString(),
    questionType: item.questionType,
    maxScore: safeNumber(item.maxScore),
    score: safeNumber(item.score),
    isCorrect: typeof item.isCorrect === "boolean" ? item.isCorrect : null,
    questionContent: (item.question?.content || "").trim(),
    referenceAnswer: (item.referenceAnswer || "").trim(),
    userAnswer: (item.userAnswer || "").trim(),
    aiPercent: item.aiPercent === null ? null : safeNumber(item.aiPercent, 0),
    aiCommentary: item.aiCommentary ? item.aiCommentary.trim() : null,
    status: item.status,
  }));

  return { ...base, items };
}

module.exports = {
  createQuizReport,
  listQuizReports,
  listRecentQuizReports,
  getQuizReportDetail,
  ensureEssayGradingRunning,
};
