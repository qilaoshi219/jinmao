// ==================== 公开考试数据访问层 ====================
// 职责：公开考试（二维码考试）的发布记录、作答会话、游客作答、统计查询
// 与 quiz_repo 的关系：复用会话/判题/报告等既有能力，本模块只负责公开考试特有数据

const prisma = require("../utils/prisma");
const crypto = require("crypto");

// 日志前缀
const TAG = "[public_exam_repo]";

// ==================== 发布记录 ====================

/**
 * 创建公开考试发布记录
 */
async function createPublicExam(data) {
  const bigUserId = BigInt(data.userId);
  const bigExamId = BigInt(data.examId);

  const record = await prisma.publicExam.create({
    data: {
      userId: bigUserId,
      examId: bigExamId,
      token: data.token,
      title: data.title,
      questionIds: data.questionIds,
      shuffle: data.shuffle,
      durationMinutes: data.durationMinutes,
      essayMode: data.essayMode,
      essayKeywords: data.essayKeywords || undefined,
      status: "published",
    },
  });

  return record;
}

/**
 * 按 token 查询公开考试（未删除）
 */
async function findPublicExamByToken(token) {
  return await prisma.publicExam.findFirst({
    where: { token, isDeleted: false },
  });
}

/**
 * 按 ID 查询公开考试（未删除）
 */
async function findPublicExamById(id) {
  return await prisma.publicExam.findFirst({
    where: { id: BigInt(id), isDeleted: false },
  });
}

/**
 * 按试卷 + 发布者查询公开考试（未删除，用于判断是否已发布）
 */
async function findPublicExamByExamId(examId, userId) {
  return await prisma.publicExam.findFirst({
    where: {
      examId: BigInt(examId),
      userId: BigInt(userId),
      isDeleted: false,
    },
  });
}

/**
 * 分页查询当前用户的公开考试列表（含试卷/题库名称，用于"选择考试"页）
 */
async function listPublicExamsByUser(userId, page, pageSize) {
  const bigUserId = BigInt(userId);

  const [total, rows] = await Promise.all([
    prisma.publicExam.count({ where: { userId: bigUserId, isDeleted: false } }),
    prisma.publicExam.findMany({
      where: { userId: bigUserId, isDeleted: false },
      orderBy: { updateTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        exam: {
          select: {
            name: true,
            textbook: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  return { total, items: rows };
}

/**
 * 更新公开考试（配置或状态）
 */
async function updatePublicExam(id, data) {
  return await prisma.publicExam.update({
    where: { id: BigInt(id) },
    data,
  });
}

/**
 * 软删除公开考试
 */
async function softDeletePublicExam(id) {
  return await prisma.publicExam.update({
    where: { id: BigInt(id) },
    data: { isDeleted: true, status: "closed" },
  });
}

// ==================== 试卷与题目 ====================

/**
 * 查询试卷及其所属题库（含所有者，用于发布权限校验）
 */
async function getExamWithTextbook(examId) {
  return await prisma.quizExam.findFirst({
    where: { id: BigInt(examId) },
    include: {
      textbook: { select: { id: true, userId: true, name: true, isDeleted: true } },
    },
  });
}

/**
 * 按 ID 批量查询题目（含答案，交卷判题用）
 * @param {string[]} questionIds
 */
async function getQuestionsByIds(questionIds) {
  const bigIds = questionIds.map((id) => BigInt(String(id)));
  return await prisma.quizQuestion.findMany({
    where: { id: { in: bigIds } },
    select: {
      id: true,
      type: true,
      content: true,
      options: true,
      answer: true,
      analysis: true,
      sortOrder: true,
    },
  });
}

/**
 * 按 ID 批量查询题目视图（不含答案，答题页使用）
 * @param {string[]} questionIds
 */
async function getQuestionViewsByIds(questionIds) {
  const bigIds = questionIds.map((id) => BigInt(String(id)));
  return await prisma.quizQuestion.findMany({
    where: { id: { in: bigIds } },
    select: {
      id: true,
      type: true,
      content: true,
      options: true,
      analysis: true,
      sortOrder: true,
    },
  });
}

// ==================== 作答会话 ====================

/**
 * 按身份查询公开考试会话（任意状态，最新一条；用于续做/防重考）
 * @param {string} publicExamId
 * @param {{userId?: string|null, anonymousKey?: string|null}} identity
 */
async function findPublicSession(publicExamId, identity) {
  const where = { publicExamId: BigInt(publicExamId), mode: "EXAM" };
  if (identity.userId) {
    where.userId = BigInt(identity.userId);
  } else {
    where.anonymousKey = identity.anonymousKey;
  }

  return await prisma.quizSession.findFirst({
    where,
    orderBy: { id: "desc" },
  });
}

/**
 * 创建公开考试会话（游客会话 userId 为 NULL）
 */
async function createPublicSession(data) {
  const bigTextbookId = data.textbookId ? BigInt(data.textbookId) : null;
  const bigExamId = data.examId ? BigInt(data.examId) : null;
  const bigPublicExamId = BigInt(data.publicExamId);

  return await prisma.quizSession.create({
    data: {
      userId: data.userId ? BigInt(data.userId) : null,
      anonymousKey: data.userId ? null : data.anonymousKey,
      textbookId: bigTextbookId,
      examId: bigExamId,
      publicExamId: bigPublicExamId,
      mode: "EXAM",
      questionIds: data.questionIds,
      totalCount: data.totalCount,
      correctCount: 0,
      currentQuestionIndex: 1,
      status: "IN_PROGRESS",
      deadlineAt: data.deadlineAt,
    },
  });
}

/**
 * 按身份查询会话详情（含作答记录与教材名）
 */
async function getPublicSessionDetail(sessionId, identity) {
  const where = { id: BigInt(sessionId), mode: "EXAM" };
  if (identity.userId) {
    where.userId = BigInt(identity.userId);
  } else {
    where.anonymousKey = identity.anonymousKey;
  }

  return await prisma.quizSession.findFirst({
    where,
    include: {
      textbook: { select: { id: true, name: true } },
      publicExam: { select: { id: true, title: true, token: true } },
      userAnswers: true,
    },
  });
}

/**
 * 更新会话位置（续做定位）
 */
async function updateSessionPosition(sessionId, currentQuestionIndex) {
  await prisma.quizSession.update({
    where: { id: BigInt(sessionId) },
    data: {
      currentQuestionIndex,
      lastAnsweredAt: new Date(),
    },
  });
}

/**
 * 保存/更新作答记录（支持登录用户与游客两种身份）
 */
async function upsertAttemptAnswer({ sessionId, userId, anonymousKey, questionId, userAnswer, isCorrect }) {
  const bigSessionId = BigInt(sessionId);
  const bigQuestionId = BigInt(questionId);

  const existing = await prisma.quizUserAnswer.findMany({
    where: {
      sessionId: bigSessionId,
      questionId: bigQuestionId,
      ...(userId ? { userId: BigInt(userId) } : { anonymousKey }),
    },
    orderBy: { id: "asc" },
  });

  if (existing.length === 0) {
    await prisma.quizUserAnswer.create({
      data: {
        userId: userId ? BigInt(userId) : null,
        anonymousKey: userId ? null : anonymousKey,
        questionId: bigQuestionId,
        sessionId: bigSessionId,
        userAnswer,
        isCorrect,
        timeSpent: 0,
      },
    });
  } else {
    const [first, ...duplicated] = existing;
    await prisma.quizUserAnswer.update({
      where: { id: first.id },
      data: { userAnswer, isCorrect },
    });
    if (duplicated.length > 0) {
      await prisma.quizUserAnswer.deleteMany({
        where: { id: { in: duplicated.map((a) => a.id) } },
      });
    }
  }
}

/**
 * 删除某题作答（用户清空答案）
 */
async function deleteAttemptAnswer({ sessionId, userId, anonymousKey, questionId }) {
  await prisma.quizUserAnswer.deleteMany({
    where: {
      sessionId: BigInt(sessionId),
      questionId: BigInt(questionId),
      ...(userId ? { userId: BigInt(userId) } : { anonymousKey }),
    },
  });
}

/**
 * 完成会话：写入总分与结果快照
 */
async function completePublicSession(sessionId, data) {
  return await prisma.quizSession.update({
    where: { id: BigInt(sessionId) },
    data: {
      status: "COMPLETED",
      correctCount: data.correctCount,
      currentQuestionIndex: data.currentQuestionIndex,
      scoreTotal: data.scoreTotal,
      resultJson: data.resultJson,
      lastAnsweredAt: new Date(),
    },
  });
}

/**
 * 更新会话结果（AI 简答批改完成后刷新）
 */
async function updateSessionResult(sessionId, data) {
  return await prisma.quizSession.update({
    where: { id: BigInt(sessionId) },
    data: {
      scoreTotal: data.scoreTotal,
      resultJson: data.resultJson,
      correctCount: data.correctCount,
    },
  });
}

/**
 * 统计会话作答数量
 */
async function countSessionAnswers(sessionId) {
  return await prisma.quizUserAnswer.count({
    where: { sessionId: BigInt(sessionId) },
  });
}

// ==================== 统计查询 ====================

/**
 * 统计公开考试全部会话数（参与人数）
 */
async function countAllSessions(publicExamId) {
  return await prisma.quizSession.count({
    where: { publicExamId: BigInt(publicExamId), mode: "EXAM" },
  });
}

/**
 * 统计公开考试已完成会话数
 */
async function countCompletedSessions(publicExamId) {
  return await prisma.quizSession.count({
    where: { publicExamId: BigInt(publicExamId), mode: "EXAM", status: "COMPLETED" },
  });
}

/**
 * 分页查询已完成会话（考生明细）
 */
async function getCompletedSessions(publicExamId, page, pageSize) {
  const bigPublicExamId = BigInt(publicExamId);

  const [total, rows] = await Promise.all([
    prisma.quizSession.count({
      where: { publicExamId: bigPublicExamId, mode: "EXAM", status: "COMPLETED" },
    }),
    prisma.quizSession.findMany({
      where: { publicExamId: bigPublicExamId, mode: "EXAM", status: "COMPLETED" },
      orderBy: { updateTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        userId: true,
        anonymousKey: true,
        totalCount: true,
        correctCount: true,
        scoreTotal: true,
        createTime: true,
        updateTime: true,
        lastAnsweredAt: true,
      },
    }),
  ]);

  return { total, items: rows };
}

/**
 * 按题目聚合已完成会话的作答正确性
 * @returns {Promise<Array<{questionId: bigint, isCorrect: boolean, _count: number}>>}
 */
async function getSessionAnswersGrouped(publicExamId) {
  return await prisma.quizUserAnswer.groupBy({
    by: ["questionId", "isCorrect"],
    where: {
      session: { publicExamId: BigInt(publicExamId), mode: "EXAM", status: "COMPLETED" },
    },
    _count: { _all: true },
  });
}

/**
 * 批量查询用户昵称（考生明细中登录用户展示）
 */
async function getUsersByIds(userIds) {
  if (!userIds || userIds.length === 0) return [];
  const bigIds = userIds.map((id) => BigInt(String(id)));
  return await prisma.user.findMany({
    where: { id: { in: bigIds } },
    select: { id: true, nickname: true },
  });
}

/**
 * 按会话查询报告（登录用户 AI 简答批改后同步报告）
 */
async function findReportBySession(sessionId) {
  return await prisma.quizReport.findFirst({
    where: { sessionId: BigInt(sessionId) },
    select: { id: true },
  });
}

/**
 * 更新报告题目明细得分（AI 简答批改）
 */
async function updateReportItemScore(reportId, questionId, data) {
  await prisma.quizReportItem.updateMany({
    where: { reportId: BigInt(reportId), questionId: BigInt(questionId) },
    data: {
      score: data.score,
      isCorrect: data.isCorrect,
      aiPercent: data.aiPercent,
      aiCommentary: data.aiCommentary,
      status: data.status,
    },
  });
}

/**
 * 更新报告总分与状态（AI 简答批改完成）
 */
async function updateReportTotals(reportId, data) {
  await prisma.quizReport.update({
    where: { id: BigInt(reportId) },
    data: {
      scoreTotal: data.scoreTotal,
      scoreEssay: data.scoreEssay,
      status: data.status,
    },
  });
}

/**
 * 由游客身份标识派生展示名（游客#XXXX）
 */
function deriveGuestName(anonymousKey) {
  const hash = crypto.createHash("md5").update(String(anonymousKey || "")).digest("hex");
  return "游客#" + hash.slice(0, 4).toUpperCase();
}

module.exports = {
  createPublicExam,
  findPublicExamByToken,
  findPublicExamById,
  findPublicExamByExamId,
  listPublicExamsByUser,
  updatePublicExam,
  softDeletePublicExam,
  getExamWithTextbook,
  getQuestionsByIds,
  getQuestionViewsByIds,
  findPublicSession,
  createPublicSession,
  getPublicSessionDetail,
  updateSessionPosition,
  upsertAttemptAnswer,
  deleteAttemptAnswer,
  completePublicSession,
  updateSessionResult,
  countSessionAnswers,
  countAllSessions,
  countCompletedSessions,
  getCompletedSessions,
  getSessionAnswersGrouped,
  getUsersByIds,
  findReportBySession,
  updateReportItemScore,
  updateReportTotals,
  deriveGuestName,
};
