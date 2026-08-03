// ==================== 公开考试（二维码考试）业务逻辑 ====================
// 职责：发布管理、考试会话（游客/登录双身份）、单场限时、交卷计分、统计报表
// 计分：客观题即时判题；简答题按发布时选择的 essayMode（ai/strict/full）处理

const crypto = require("crypto");
const repo = require("../repo/public_exam_repo");
const quizRepo = require("../repo/quiz_repo");
const quizService = require("./quiz_service");
const { judgeEssayByAI } = require("./quiz_judge");
const activityRepo = require("../utils/repo/activity_repo");
const { checkCanUseAI } = require("../utils/balance");

// 日志前缀
const TAG = "[public_exam_service]";

// 简答 AI 判题判"对"的百分比阈值
const AI_CORRECT_THRESHOLD = 60;

// ==================== 工具函数 ====================

/**
 * 生成公开链接 token（32 位十六进制随机串）
 */
function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * 钳位序号
 */
function clampIndex(index, total) {
  return Math.min(Math.max(index, 1), Math.max(total, 1));
}

/**
 * 解析考生身份：登录用户优先，否则使用游客 anonymousKey
 * @returns {{userId: string|null, anonymousKey: string|null}}
 */
function resolveIdentity(userId, anonymousKey) {
  if (userId) {
    return { userId: String(userId), anonymousKey: null };
  }
  if (!anonymousKey || typeof anonymousKey !== "string") {
    throw new Error("ANONYMOUS_KEY_REQUIRED");
  }
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(anonymousKey)) {
    throw new Error("ANONYMOUS_KEY_INVALID");
  }
  return { userId: null, anonymousKey };
}

/**
 * 计算剩余秒数
 */
function remainingSeconds(deadlineAt) {
  if (!deadlineAt) return null;
  const ms = new Date(deadlineAt).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 1000));
}

/**
 * 构建考试信息（入场页）
 */
async function buildPublicInfo(pub) {
  const questionRows = await repo.getQuestionViewsByIds(pub.questionIds.map(String));
  const essayCount = questionRows.filter((q) => q.type === "ESSAY").length;
  return {
    token: pub.token,
    title: pub.title,
    questionCount: pub.questionIds.length,
    durationMinutes: pub.durationMinutes,
    essayMode: pub.essayMode,
    hasEssay: essayCount > 0,
    shuffle: pub.shuffle,
    status: pub.status,
  };
}

/**
 * 从会话构建结果视图（结果页/重看/防重考返回）
 */
function buildResult(pub, session) {
  const result = session.resultJson || {
    status: "COMPLETED",
    totalCount: session.totalCount || 0,
    scoreTotal: session.scoreTotal || 0,
    items: [],
  };
  return {
    sessionId: session.id.toString(),
    title: pub.title,
    gradingStatus: result.status || "COMPLETED",
    scoreTotal: session.scoreTotal ?? result.scoreTotal ?? 0,
    totalCount: result.totalCount || session.totalCount || 0,
    objectiveCount: result.objectiveCount || 0,
    essayCount: result.essayCount || 0,
    items: result.items || [],
  };
}

/**
 * 校验严格模式关键词：每道简答题都必须配置关键词
 */
function validateStrictKeywords(questions, essayKeywords) {
  const essayQuestions = questions.filter((q) => q.type === "ESSAY");
  if (essayQuestions.length === 0) return;

  const keywordsMap = essayKeywords || {};
  for (const q of essayQuestions) {
    const keywords = keywordsMap[q.id.toString()];
    if (!Array.isArray(keywords) || keywords.filter((k) => typeof k === "string" && k.trim()).length === 0) {
      throw new Error("ESSAY_KEYWORDS_REQUIRED");
    }
  }
}

// ==================== 发布与管理 ====================

/**
 * 发布（或更新配置）公开考试
 * @param {string} userId - 发布者用户ID
 * @param {Object} params - { examId, durationMinutes, essayMode, essayKeywords, shuffle }
 */
async function publishExam(userId, params) {
  const examId = String(params.examId || "");
  const durationMinutes = parseInt(params.durationMinutes, 10);
  const essayMode = String(params.essayMode || "full");
  const shuffle = !!params.shuffle;

  if (!/^\d+$/.test(examId)) throw new Error("INVALID_EXAM_ID");
  if (isNaN(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
    throw new Error("INVALID_DURATION");
  }
  if (!["ai", "strict", "full"].includes(essayMode)) throw new Error("INVALID_ESSAY_MODE");

  // 余额校验：AI 判题需要余额 > 0 且未锁定（前端禁用 + 后端兜底双重保障）
  if (essayMode === "ai") {
    const balanceCheck = await checkCanUseAI(String(userId));
    const numericBalance = parseFloat(balanceCheck.balance || "0");
    if (!balanceCheck.allowed || numericBalance <= 0) {
      throw new Error("BALANCE_INSUFFICIENT");
    }
  }

  // 校验试卷归属
  const exam = await repo.getExamWithTextbook(examId);
  if (!exam || exam.textbook?.isDeleted) throw new Error("EXAM_NOT_FOUND");
  if (String(exam.textbook.userId) !== String(userId)) throw new Error("EXAM_NOT_FOUND");

  // 发布时锁定题目快照
  const questionIds = await quizRepo.getAllQuestionIdsByExamId(examId);
  if (questionIds.length === 0) throw new Error("NO_QUESTIONS_AVAILABLE");

  // 严格模式：每道简答题必须提供关键词
  if (essayMode === "strict") {
    const questions = await repo.getQuestionsByIds(questionIds);
    validateStrictKeywords(questions, params.essayKeywords);
  }

  const existing = await repo.findPublicExamByExamId(examId, userId);
  if (existing) {
    // 已发布 → 更新配置（状态保持不变，由单独的状态接口控制开/停）
    const updated = await repo.updatePublicExam(existing.id, {
      title: exam.name,
      questionIds,
      shuffle,
      durationMinutes,
      essayMode,
      essayKeywords: essayMode === "strict" ? params.essayKeywords : null,
    });
    console.log(TAG + " 公开考试配置已更新 — token: " + updated.token + ", examId: " + examId);
    return {
      created: false,
      publicExam: {
        token: updated.token,
        status: updated.status,
        title: updated.title,
      },
    };
  }

  const record = await repo.createPublicExam({
    userId,
    examId,
    token: generateToken(),
    title: exam.name,
    questionIds,
    shuffle,
    durationMinutes,
    essayMode,
    essayKeywords: essayMode === "strict" ? params.essayKeywords : null,
  });

  console.log(TAG + " 公开考试发布成功 — token: " + record.token + ", examId: " + examId + ", 题数: " + questionIds.length);
  return {
    created: true,
    publicExam: {
      token: record.token,
      status: record.status,
      title: record.title,
    },
  };
}

/**
 * 获取考试信息（免登录）
 */
async function getPublicInfo(token) {
  const pub = await repo.findPublicExamByToken(token);
  if (!pub) throw new Error("NOT_FOUND");
  return await buildPublicInfo(pub);
}

/**
 * 当前用户的公开考试列表（"选择考试"页）
 */
async function listMyPublicExams(userId, page, pageSize) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const ps = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 20));

  const { total, items } = await repo.listPublicExamsByUser(userId, p, ps);
  const withCounts = await Promise.all(
    items.map(async (r) => ({
      token: r.token,
      title: r.title,
      examName: r.exam?.name || "",
      textbookName: r.exam?.textbook?.name || "",
      status: r.status,
      durationMinutes: r.durationMinutes,
      essayMode: r.essayMode,
      shuffle: r.shuffle,
      totalParticipants: await repo.countAllSessions(r.id.toString()),
      completedCount: await repo.countCompletedSessions(r.id.toString()),
      createTime: r.createTime,
      updateTime: r.updateTime,
    }))
  );

  return { items: withCounts, total, page: p, pageSize: ps };
}

/**
 * 获取发布表单数据（发布者弹窗用）：试卷简答题列表 + 已发布配置 + 余额信息
 * AI 判题需要余额支持，余额不足时前端禁用该选项
 */
async function getPublishForm(userId, examId) {
  const exam = await repo.getExamWithTextbook(String(examId));
  if (!exam || exam.textbook?.isDeleted) throw new Error("EXAM_NOT_FOUND");
  if (String(exam.textbook.userId) !== String(userId)) throw new Error("EXAM_NOT_FOUND");

  const questionIds = await quizRepo.getAllQuestionIdsByExamId(String(examId));
  const questions = questionIds.length > 0 ? await repo.getQuestionsByIds(questionIds) : [];
  const essayQuestions = questions
    .filter((q) => q.type === "ESSAY")
    .map((q) => ({ id: q.id.toString(), content: q.content }));

  const existing = await repo.findPublicExamByExamId(String(examId), userId);

  // 余额校验：AI 判题需要余额 > 0 且未锁定
  const balanceCheck = await checkCanUseAI(String(userId));
  const numericBalance = parseFloat(balanceCheck.balance || "0");
  const aiGradingAvailable = balanceCheck.allowed && numericBalance > 0;

  return {
    examId: String(examId),
    name: exam.name,
    essayQuestions,
    balance: balanceCheck.balance || "0",
    balanceLocked: balanceCheck.balanceLocked || false,
    aiGradingAvailable,
    publicExam: existing
      ? {
          token: existing.token,
          status: existing.status,
          durationMinutes: existing.durationMinutes,
          essayMode: existing.essayMode,
          essayKeywords: existing.essayKeywords || {},
          shuffle: existing.shuffle,
        }
      : null,
  };
}

/**
 * 停止/恢复考试
 */
async function setPublicExamStatus(token, userId, status) {
  if (!["published", "closed"].includes(status)) throw new Error("INVALID_STATUS");
  const pub = await repo.findPublicExamByToken(token);
  if (!pub) throw new Error("NOT_FOUND");
  if (String(pub.userId) !== String(userId)) throw new Error("FORBIDDEN");

  const updated = await repo.updatePublicExam(pub.id, { status });
  return { token: updated.token, status: updated.status };
}

/**
 * 取消发布（软删除）
 */
async function unpublishExam(token, userId) {
  const pub = await repo.findPublicExamByToken(token);
  if (!pub) throw new Error("NOT_FOUND");
  if (String(pub.userId) !== String(userId)) throw new Error("FORBIDDEN");
  await repo.softDeletePublicExam(pub.id);
  return { token: pub.token, status: "closed" };
}

// ==================== 考试流程 ====================

/**
 * 开始/续做考试
 */
async function startAttempt({ token, userId, anonymousKey }) {
  const pub = await repo.findPublicExamByToken(token);
  if (!pub) throw new Error("NOT_FOUND");
  if (pub.status !== "published") throw new Error("EXAM_CLOSED");

  const identity = resolveIdentity(userId, anonymousKey);

  const existing = await repo.findPublicSession(pub.id.toString(), identity);
  if (existing) {
    if (existing.status === "COMPLETED") {
      return { status: "completed", result: buildResult(pub, existing) };
    }
    // 进行中：已超时则自动交卷，否则续做
    if (existing.deadlineAt && new Date(existing.deadlineAt).getTime() <= Date.now()) {
      const finalized = await finalizeAttempt(pub, existing, identity);
      return { status: "completed", result: finalized };
    }
    return {
      status: "resume",
      sessionId: existing.id.toString(),
      title: pub.title,
      totalCount: existing.totalCount,
      remainingSeconds: remainingSeconds(existing.deadlineAt),
      deadlineAt: existing.deadlineAt,
    };
  }

  // 新会话
  const exam = await repo.getExamWithTextbook(pub.examId.toString());
  let ids = pub.questionIds.map(String);
  if (pub.shuffle) {
    ids = quizService.shuffleArray(ids);
  }

  const deadlineAt = new Date(Date.now() + pub.durationMinutes * 60 * 1000);
  const session = await repo.createPublicSession({
    publicExamId: pub.id.toString(),
    userId: identity.userId,
    anonymousKey: identity.anonymousKey,
    examId: pub.examId.toString(),
    textbookId: exam?.textbookId ? exam.textbookId.toString() : null,
    questionIds: ids,
    totalCount: ids.length,
    deadlineAt,
  });

  console.log(TAG + " 新会话创建 — sessionId: " + session.id + ", token: " + token + ", 题数: " + ids.length);
  return {
    status: "started",
    sessionId: session.id.toString(),
    title: pub.title,
    totalCount: ids.length,
    remainingSeconds: remainingSeconds(deadlineAt),
    deadlineAt,
  };
}

/**
 * 获取答题页详情（不含答案）
 */
async function getAttemptDetail({ token, sessionId, userId, anonymousKey }) {
  const pub = await repo.findPublicExamByToken(token);
  if (!pub) throw new Error("NOT_FOUND");
  const identity = resolveIdentity(userId, anonymousKey);

  const session = await repo.getPublicSessionDetail(sessionId, identity);
  if (!session || session.publicExam?.id?.toString() !== pub.id.toString()) {
    throw new Error("SESSION_NOT_FOUND");
  }

  if (session.status === "COMPLETED") {
    return { status: "completed", result: buildResult(pub, session) };
  }

  const ids = (session.questionIds || []).map((id) => String(id));
  const questionRows = await repo.getQuestionViewsByIds(ids);
  const questionMap = new Map();
  for (const q of questionRows) questionMap.set(q.id.toString(), q);

  const orderedQuestions = [];
  const typeCounts = { single: 0, multiple: 0, judge: 0, fill: 0, essay: 0 };
  for (let i = 0; i < ids.length; i++) {
    const q = questionMap.get(ids[i]);
    if (!q) continue;
    const view = quizService.buildQuestionView(q, i + 1, pub.title);
    const frontendType = quizService.mapToFrontendType(q.type);
    typeCounts[frontendType]++;
    orderedQuestions.push(view);
  }

  const answerMap = {};
  for (const ua of session.userAnswers) {
    const q = questionMap.get(ua.questionId.toString());
    if (!q) continue;
    answerMap[ua.questionId.toString()] = quizService.deserializeAnswer(q.type, ua.userAnswer);
  }

  return {
    status: "in_progress",
    sessionId: session.id.toString(),
    title: pub.title,
    totalCount: orderedQuestions.length,
    currentQuestionIndex: clampIndex(session.currentQuestionIndex, orderedQuestions.length),
    remainingSeconds: remainingSeconds(session.deadlineAt),
    deadlineAt: session.deadlineAt,
    questions: orderedQuestions,
    answers: answerMap,
    typeCounts,
  };
}

/**
 * 保存作答进度
 */
async function saveProgress({ token, sessionId, userId, anonymousKey, payload }) {
  const pub = await repo.findPublicExamByToken(token);
  if (!pub) throw new Error("NOT_FOUND");
  const identity = resolveIdentity(userId, anonymousKey);

  const session = await repo.getPublicSessionDetail(sessionId, identity);
  if (!session || session.publicExam?.id?.toString() !== pub.id.toString()) {
    throw new Error("SESSION_NOT_FOUND");
  }
  if (session.status !== "IN_PROGRESS") throw new Error("SESSION_NOT_ACTIVE");

  const questionIds = (session.questionIds || []).map((id) => String(id));
  const currentIndex = clampIndex(payload.currentQuestionIndex, questionIds.length);
  await repo.updateSessionPosition(sessionId, currentIndex);

  if (!payload.questionId) {
    return { sessionId, currentQuestionIndex: currentIndex };
  }

  const questionId = String(payload.questionId);
  if (!questionIds.includes(questionId)) throw new Error("QUESTION_NOT_IN_SESSION");

  const question = await quizRepo.getQuestionWithAnswer(BigInt(questionId));
  if (!question) throw new Error("QUESTION_NOT_FOUND");

  const serialized = quizService.serializeAnswer(question.type, payload.answer);
  if (!serialized) {
    await repo.deleteAttemptAnswer({
      sessionId,
      userId: identity.userId,
      anonymousKey: identity.anonymousKey,
      questionId,
    });
    return { sessionId, currentQuestionIndex: currentIndex };
  }

  const isCorrect = quizService.evaluateAnswer({
    questionType: question.type,
    correctAnswer: question.answer,
    userAnswer: payload.answer,
  });

  await repo.upsertAttemptAnswer({
    sessionId,
    userId: identity.userId,
    anonymousKey: identity.anonymousKey,
    questionId,
    userAnswer: serialized,
    isCorrect,
  });

  // 登录考生同步错题本
  if (identity.userId) {
    await quizRepo.upsertWrongQuestion({
      userId: identity.userId,
      questionId,
      textbookId: question.textbookId.toString(),
      isCorrect,
    });
  }

  if (identity.userId) {
    activityRepo.recordDailyActivity(identity.userId).catch(() => {});
  }

  return { sessionId, currentQuestionIndex: currentIndex };
}

/**
 * 交卷（含自动交卷与计分）
 */
async function completeAttempt({ token, sessionId, userId, anonymousKey }) {
  const pub = await repo.findPublicExamByToken(token);
  if (!pub) throw new Error("NOT_FOUND");
  const identity = resolveIdentity(userId, anonymousKey);

  const session = await repo.getPublicSessionDetail(sessionId, identity);
  if (!session || session.publicExam?.id?.toString() !== pub.id.toString()) {
    throw new Error("SESSION_NOT_FOUND");
  }

  if (session.status === "COMPLETED") {
    return { status: "completed", result: buildResult(pub, session) };
  }

  const result = await finalizeAttempt(pub, session, identity);
  return { status: "completed", result };
}

/**
 * 查询当前结果（AI 简答批改轮询用）
 */
async function getResult({ token, sessionId, userId, anonymousKey }) {
  const pub = await repo.findPublicExamByToken(token);
  if (!pub) throw new Error("NOT_FOUND");
  const identity = resolveIdentity(userId, anonymousKey);

  const session = await repo.getPublicSessionDetail(sessionId, identity);
  if (!session || session.publicExam?.id?.toString() !== pub.id.toString()) {
    throw new Error("SESSION_NOT_FOUND");
  }
  return { status: "completed", result: buildResult(pub, session) };
}

/**
 * 执行交卷计分并落库
 */
async function finalizeAttempt(pub, session, identity) {
  // 重新拉取完整会话（含作答记录）：超时自动交卷路径传入的会话可能缺少 userAnswers
  const freshSession = await repo.getPublicSessionDetail(session.id.toString(), identity);
  if (!freshSession) throw new Error("SESSION_NOT_FOUND");
  session = freshSession;

  const ids = (session.questionIds || []).map((id) => String(id));
  const questions = await repo.getQuestionsByIds(ids);
  const questionMap = new Map();
  for (const q of questions) questionMap.set(q.id.toString(), q);

  const answerRowMap = new Map();
  for (const ua of session.userAnswers) {
    answerRowMap.set(ua.questionId.toString(), ua);
  }

  const totalCount = ids.length;
  const maxScore = totalCount > 0 ? 100 / totalCount : 0;
  const keywordsMap = pub.essayKeywords || {};

  let objectiveCount = 0;
  let essayCount = 0;
  let correctCount = 0;
  let hasPendingAI = false;
  const items = [];

  for (const qid of ids) {
    const q = questionMap.get(qid);
    const answerRow = answerRowMap.get(qid);
    const userAnswer = answerRow ? quizService.deserializeAnswer(q ? q.type : "ESSAY", answerRow.userAnswer) : "";
    const userAnswerText = Array.isArray(userAnswer) ? userAnswer.join(",") : String(userAnswer || "");

    if (!q) {
      items.push({
        questionId: qid,
        questionType: "ESSAY",
        maxScore,
        score: 0,
        isCorrect: null,
        userAnswer: userAnswerText,
        referenceAnswer: null,
        status: "DONE",
      });
      continue;
    }

    if (q.type === "ESSAY") {
      essayCount++;
      if (pub.essayMode === "full") {
        correctCount++;
        items.push({
          questionId: qid,
          questionType: "ESSAY",
          maxScore,
          score: maxScore,
          isCorrect: true,
          userAnswer: userAnswerText,
          referenceAnswer: q.answer,
          keywords: null,
          commentary: "默认满分",
          status: "DONE",
        });
      } else if (pub.essayMode === "strict") {
        const keywords = (keywordsMap[qid] || []).map((k) => String(k).trim()).filter(Boolean);
        const hit = keywords.length > 0 && keywords.every((kw) => userAnswerText.includes(kw));
        if (hit) correctCount++;
        items.push({
          questionId: qid,
          questionType: "ESSAY",
          maxScore,
          score: hit ? maxScore : 0,
          isCorrect: hit,
          userAnswer: userAnswerText,
          referenceAnswer: q.answer,
          keywords,
          commentary: hit ? "包含全部关键词" : "未包含全部关键词",
          status: "DONE",
        });
      } else {
        // ai 模式：先记 0 分，异步批改后刷新
        hasPendingAI = true;
        items.push({
          questionId: qid,
          questionType: "ESSAY",
          maxScore,
          score: 0,
          isCorrect: null,
          userAnswer: userAnswerText,
          referenceAnswer: q.answer,
          keywords: null,
          commentary: null,
          status: "PENDING",
        });
      }
      continue;
    }

    // 客观题即时判题
    objectiveCount++;
    const isCorrect = quizService.evaluateAnswer({
      questionType: q.type,
      correctAnswer: q.answer,
      userAnswer,
    });
    if (isCorrect) correctCount++;
    items.push({
      questionId: qid,
      questionType: q.type,
      maxScore,
      score: isCorrect ? maxScore : 0,
      isCorrect,
      userAnswer: userAnswerText,
      referenceAnswer: q.answer,
      keywords: null,
      commentary: null,
      status: "DONE",
    });
  }

  const scoreTotal = items.reduce((sum, item) => sum + item.score, 0);
  const resultJson = {
    status: hasPendingAI ? "GRADING" : "COMPLETED",
    totalCount,
    objectiveCount,
    essayCount,
    scoreTotal,
    items: items.map((item) => {
      const q = questionMap.get(item.questionId);
      return {
        ...item,
        content: q ? q.content : "",
        options: q ? q.options : null,
        analysis: q ? q.analysis : null,
      };
    }),
  };

  // 落库：完成会话
  await repo.completePublicSession(session.id.toString(), {
    correctCount,
    currentQuestionIndex: Math.max(totalCount, 1),
    scoreTotal,
    resultJson,
  });

  // 登录考生：同步错题本（AI 模式简答待批改后处理）
  if (identity.userId) {
    for (const item of items) {
      if (item.isCorrect === null || item.isCorrect === undefined) continue;
      await quizRepo.upsertWrongQuestion({
        userId: identity.userId,
        questionId: item.questionId,
        textbookId: session.textbookId?.toString() || null,
        isCorrect: item.isCorrect,
      });
    }
    activityRepo.recordDailyActivity(identity.userId).catch(() => {});
  }

  // 登录考生：生成刷题报告
  if (identity.userId) {
    const report = await quizRepo.createReport({
      userId: identity.userId,
      sessionId: session.id.toString(),
      textbookId: session.textbookId?.toString() || null,
      status: hasPendingAI ? "GRADING" : "COMPLETED",
      totalCount,
      objectiveCount,
      essayCount,
      scoreObjective: items.filter((i) => i.questionType !== "ESSAY").reduce((s, i) => s + i.score, 0),
      scoreEssay: items.filter((i) => i.questionType === "ESSAY").reduce((s, i) => s + i.score, 0),
      scoreTotal,
      items: items.map((item) => ({
        questionId: item.questionId,
        questionType: item.questionType,
        maxScore: item.maxScore,
        score: item.score,
        isCorrect: item.isCorrect,
        userAnswer: item.userAnswer || null,
        referenceAnswer: item.referenceAnswer || null,
        status: item.status,
      })),
    });
    console.log(TAG + " 登录考生报告已生成 — reportId: " + report.id + ", sessionId: " + session.id);
  }

  // AI 模式：异步批改简答（不阻塞交卷响应）
  if (hasPendingAI) {
    gradePendingEssays(pub, session.id.toString(), identity).catch((error) => {
      console.error(TAG + " AI 简答批改失败: " + error.message);
    });
  }

  return buildResult(pub, {
    ...session,
    status: "COMPLETED",
    scoreTotal,
    resultJson,
  });
}

/**
 * 异步 AI 简答批改：更新会话结果，登录考生同步报告与错题本
 * AI 判题费用记到发布者账号
 */
async function gradePendingEssays(pub, sessionId, identity) {
  const session = await repo.getPublicSessionDetail(sessionId, identity);
  if (!session || !session.resultJson) return;

  const result = session.resultJson;
  const pending = (result.items || []).filter((item) => item.status === "PENDING");
  if (pending.length === 0) return;

  // 判题费用记到发布者：批改前校验发布者余额/锁定状态，余额不足时不发起任何 LLM 调用
  const publisherBalanceCheck = await checkCanUseAI(String(pub.userId));
  const publisherBalance = parseFloat(publisherBalanceCheck.balance || "0");
  if (!publisherBalanceCheck.allowed || publisherBalance <= 0) {
    console.warn(TAG + " 发布者余额不足/已锁定，跳过 AI 判题 — publicExamId: " + pub.id + ", 未批改题数: " + pending.length);
    for (const item of pending) {
      item.status = "FAILED";
      item.isCorrect = null;
      item.commentary = "发布者余额不足，暂无法完成AI判题";
    }
    result.scoreTotal = result.items.reduce((sum, i) => sum + i.score, 0);
    result.status = "COMPLETED";
    const correctCount = result.items.filter((i) => i.isCorrect === true).length;
    await repo.updateSessionResult(sessionId, {
      scoreTotal: result.scoreTotal,
      correctCount,
      resultJson: result,
    });
    return;
  }

  const questions = await repo.getQuestionsByIds(result.items.map((i) => i.questionId));
  const questionMap = new Map();
  for (const q of questions) questionMap.set(q.id.toString(), q);

  for (const item of pending) {
    const q = questionMap.get(item.questionId);
    if (!q) continue;
    try {
      const judged = await judgeEssayByAI({
        userId: String(pub.userId), // 判题费用记到发布者
        question: q.content,
        referenceAnswer: q.answer,
        userAnswer: item.userAnswer || "",
      });
      item.score = Math.round((judged.percent / 100) * item.maxScore * 100) / 100;
      item.isCorrect = judged.percent >= AI_CORRECT_THRESHOLD;
      item.commentary = judged.commentary;
      item.aiPercent = judged.percent;
      item.status = "DONE";
    } catch (error) {
      console.error(TAG + " 单题 AI 判题失败 — questionId: " + item.questionId + ": " + error.message);
      item.status = "FAILED";
      item.isCorrect = null;
      item.commentary = "AI 判题失败，请联系发布者";
    }
  }

  result.scoreTotal = result.items.reduce((sum, i) => sum + i.score, 0);
  result.status = result.items.some((i) => i.status === "PENDING" || i.status === "FAILED")
    ? (result.items.some((i) => i.status === "PENDING") ? "GRADING" : "COMPLETED")
    : "COMPLETED";

  const correctCount = result.items.filter((i) => i.isCorrect === true).length;
  await repo.updateSessionResult(sessionId, {
    scoreTotal: result.scoreTotal,
    correctCount,
    resultJson: result,
  });

  // 登录考生：同步错题本 + 报告
  if (identity.userId) {
    for (const item of result.items) {
      if (item.isCorrect === null || item.isCorrect === undefined) continue;
      await quizRepo.upsertWrongQuestion({
        userId: identity.userId,
        questionId: item.questionId,
        textbookId: session.textbookId?.toString() || null,
        isCorrect: item.isCorrect,
      });
    }

    const report = await repo.findReportBySession(sessionId);
    if (report) {
      for (const item of result.items) {
        await repo.updateReportItemScore(report.id.toString(), item.questionId, {
          score: item.score,
          isCorrect: item.isCorrect,
          aiPercent: item.aiPercent ?? null,
          aiCommentary: item.commentary ?? null,
          status: item.status === "PENDING" ? "RUNNING" : item.status,
        });
      }
      await repo.updateReportTotals(report.id.toString(), {
        scoreTotal: result.scoreTotal,
        scoreEssay: result.items.filter((i) => i.questionType === "ESSAY").reduce((s, i) => s + i.score, 0),
        status: result.status,
      });
    }
  }

  console.log(TAG + " AI 简答批改完成 — sessionId: " + sessionId + ", scoreTotal: " + result.scoreTotal);
}

// ==================== 统计报表（所有者） ====================

/**
 * 获取考试统计数据
 */
async function getStats({ token, userId, page, pageSize }) {
  const pub = await repo.findPublicExamByToken(token);
  if (!pub) throw new Error("NOT_FOUND");
  if (String(pub.userId) !== String(userId)) throw new Error("FORBIDDEN");

  const p = Math.max(1, parseInt(page, 10) || 1);
  const ps = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 20));

  const [allCount, completedCount, completedResult, grouped, questionRows] = await Promise.all([
    repo.countAllSessions(pub.id.toString()),
    repo.countCompletedSessions(pub.id.toString()),
    repo.getCompletedSessions(pub.id.toString(), p, ps),
    repo.getSessionAnswersGrouped(pub.id.toString()),
    repo.getQuestionViewsByIds(pub.questionIds.map(String)),
  ]);

  const questionMap = new Map();
  for (const q of questionRows) questionMap.set(q.id.toString(), q);

  // 每题正确率
  const answerStats = new Map(); // questionId -> { correct, total }
  for (const row of grouped) {
    const key = row.questionId.toString();
    if (!answerStats.has(key)) answerStats.set(key, { correct: 0, total: 0 });
    const stat = answerStats.get(key);
    stat.total += row._count._all;
    if (row.isCorrect) stat.correct += row._count._all;
  }

  const perQuestion = pub.questionIds.map((qid, index) => {
    const stat = answerStats.get(String(qid)) || { correct: 0, total: 0 };
    const q = questionMap.get(String(qid));
    return {
      index: index + 1,
      questionId: String(qid),
      content: q ? q.content : "",
      type: q ? q.type : "",
      correctCount: stat.correct,
      totalCount: stat.total,
      accuracy: stat.total > 0 ? Math.round((stat.correct / stat.total) * 1000) / 10 : 0,
    };
  });

  let sumCorrect = 0;
  let sumTotal = 0;
  for (const row of grouped) {
    sumTotal += row._count._all;
    if (row.isCorrect) sumCorrect += row._count._all;
  }
  const averageAccuracy = sumTotal > 0 ? Math.round((sumCorrect / sumTotal) * 1000) / 10 : 0;

  const completedSessions = completedResult.items;
  const userIds = [...new Set(completedSessions.map((s) => (s.userId ? s.userId.toString() : null)).filter(Boolean))];
  const users = await repo.getUsersByIds(userIds);
  const userMap = new Map();
  for (const u of users) userMap.set(u.id.toString(), u);

  const participants = completedSessions.map((s) => {
    const isAnonymous = !s.userId;
    const durationSeconds = s.createTime
      ? Math.max(0, Math.round((new Date(s.updateTime || s.createTime).getTime() - new Date(s.createTime).getTime()) / 1000))
      : 0;
    return {
      sessionId: s.id.toString(),
      name: isAnonymous ? repo.deriveGuestName(s.anonymousKey) : (userMap.get(s.userId.toString())?.nickname || "用户" + s.userId),
      isAnonymous,
      score: s.scoreTotal ?? 0,
      correctCount: s.correctCount || 0,
      totalCount: s.totalCount || 0,
      durationSeconds,
      submittedAt: s.updateTime,
    };
  });

  const averageScore = completedSessions.length > 0
    ? Math.round((completedSessions.reduce((sum, s) => sum + (s.scoreTotal || 0), 0) / completedSessions.length) * 10) / 10
    : 0;

  return {
    token: pub.token,
    title: pub.title,
    status: pub.status,
    essayMode: pub.essayMode,
    durationMinutes: pub.durationMinutes,
    shuffle: pub.shuffle,
    totalParticipants: allCount,
    completedCount,
    averageAccuracy,
    averageScore,
    perQuestion,
    participants,
    total: completedResult.total,
    page: p,
    pageSize: ps,
  };
}

module.exports = {
  publishExam,
  getPublicInfo,
  listMyPublicExams,
  getPublishForm,
  setPublicExamStatus,
  unpublishExam,
  startAttempt,
  getAttemptDetail,
  saveProgress,
  completeAttempt,
  getResult,
  getStats,
};
