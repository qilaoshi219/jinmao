// ==================== 刷题核心业务逻辑 ====================
// 职责：会话状态管理、题目抽样、即时判题、进度保存、交卷
// 移植自金毛刷题 test/金毛刷题/backend/src/modules/quiz/service.ts

const quizRepo = require("../repo/quiz_repo");
const activityRepo = require("../utils/repo/activity_repo"); // 每日活动记录仓库

// 日志前缀
const TAG = "[quiz_service]";

// ==================== 常量配置 ====================

/** 参与随机抽题的 5 种题型 */
const RANDOM_QUESTION_TYPES = ["SINGLE", "MULTIPLE", "JUDGE", "FILL", "ESSAY"];

/** 每种题型随机抽取的数量 */
const RANDOM_QUESTIONS_PER_TYPE = 5;

// ==================== 工具函数 ====================

/**
 * Fisher-Yates 洗牌算法
 * @param {Array} items
 * @returns {Array} 新数组（不修改原数组）
 */
function shuffleArray(items) {
  const copied = [...items];
  for (let i = copied.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copied[i];
    copied[i] = copied[j];
    copied[j] = temp;
  }
  return copied;
}

/**
 * 钳位题目序号到有效范围
 */
function clampIndex(index, total) {
  return Math.min(Math.max(index, 1), Math.max(total, 1));
}

/**
 * 前端题型映射
 */
function mapToFrontendType(dbType) {
  switch (dbType) {
    case "SINGLE": return "single";
    case "MULTIPLE": return "multiple";
    case "JUDGE": return "judge";
    case "FILL": return "fill";
    case "ESSAY": return "essay";
    default: return "single";
  }
}

/**
 * 解析数据库选项 JSON → 前端格式 [{key, text}]
 * 兼容两种入库格式：
 *   1. 对象数组（传统导入）：[{key: "A", value: "选项内容"}]
 *   2. 字符串数组（AI 生成）：["A. 选项内容", "B. 选项内容"]
 */
function parseOptions(rawOptions) {
  if (!Array.isArray(rawOptions)) return [];
  return rawOptions
    .map((item) => {
      // 格式 1：对象数组 [{key, value}] → 直接提取
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return {
          key: String(item.key || ""),
          text: String(item.value || item.text || ""),
        };
      }
      // 格式 2：字符串数组 ["A. 选项内容"] → 正则解析
      if (typeof item === "string") {
        const match = item.match(/^\s*([A-Za-z])[\.\、\)\s]+(.+?)\s*$/);
        if (match) {
          return { key: match[1].toUpperCase(), text: match[2].trim() };
        }
      }
      return null;
    })
    .filter((o) => o && o.key && o.text);
}

// ==================== 判题逻辑 ====================

/**
 * 规范化判断题答案
 */
function normalizeJudgeAnswer(answer) {
  const n = String(answer || "").trim();
  if (["correct", "正确", "对", "true"].includes(n.toLowerCase())) return "正确";
  if (["wrong", "错误", "错", "false"].includes(n.toLowerCase())) return "错误";
  return n;
}

/**
 * 解析填空题答案候选列表
 */
function parseFillAnswerCandidates(correctAnswer) {
  const trimmed = String(correctAnswer || "").trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch (_) { /* ignore */ }
  return trimmed ? [trimmed] : [];
}

/**
 * 即时判题（服务端判断对错）
 * @param {{questionType: string, correctAnswer: string, userAnswer: any}} params
 * @returns {boolean}
 */
function evaluateAnswer({ questionType, correctAnswer, userAnswer }) {
  if (questionType === "SINGLE") {
    const user = String(userAnswer || "").trim().toUpperCase();
    const correct = correctAnswer.trim().toUpperCase();
    return !!user && user === correct;
  }

  if (questionType === "MULTIPLE") {
    const correctSet = new Set(
      correctAnswer.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    );

    const userItems = Array.isArray(userAnswer)
      ? userAnswer.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
      : String(userAnswer).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

    const userSet = new Set(userItems);

    if (correctSet.size === 0 || userSet.size === 0 || correctSet.size !== userSet.size) return false;
    for (const item of correctSet) {
      if (!userSet.has(item)) return false;
    }
    return true;
  }

  if (questionType === "JUDGE") {
    const user = normalizeJudgeAnswer(String(userAnswer || ""));
    const correct = normalizeJudgeAnswer(correctAnswer);
    return !!user && user === correct;
  }

  if (questionType === "FILL") {
    const user = String(userAnswer || "").trim();
    if (!user) return false;
    const candidates = parseFillAnswerCandidates(correctAnswer);
    return candidates.some((c) => c === user);
  }

  // 简答题由 AI 判题，此处不判
  return false;
}

/**
 * 序列化用户答案（用于存储）
 */
function serializeAnswer(questionType, answer) {
  if (questionType === "MULTIPLE") {
    if (!Array.isArray(answer)) return null;
    const normalized = answer.map((s) => String(s).trim()).filter(Boolean);
    if (normalized.length === 0) return null;
    return JSON.stringify(normalized);
  }
  const normalized = String(answer || "").trim();
  return normalized || null;
}

/**
 * 反序列化用户答案（用于前端展示）
 */
function deserializeAnswer(questionType, rawAnswer) {
  if (questionType === "MULTIPLE") {
    try {
      const parsed = JSON.parse(rawAnswer);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim()).filter(Boolean);
      }
    } catch (_) { /* ignore */ }
    return String(rawAnswer).split(",").map((s) => s.trim()).filter(Boolean);
  }
  return String(rawAnswer || "");
}

// ==================== 题目视图构建 ====================

/**
 * 构建前端题目视图
 */
function buildQuestionView(question, index, textbookName) {
  const frontendType = mapToFrontendType(question.type);
  const base = {
    id: question.id.toString(),
    index,
    type: frontendType,
    stemTitle: textbookName + "智能刷题",
    stemText: question.content.trim(),
  };

  if (question.type === "SINGLE" || question.type === "MULTIPLE") {
    return {
      ...base,
      options: parseOptions(question.options),
    };
  }

  if (question.type === "FILL") {
    return {
      ...base,
      placeholder: "请输入答案...",
      tip: question.analysis?.trim() || "填空题支持续做，离开页面后仍会保留本题答案。",
    };
  }

  if (question.type === "ESSAY") {
    return {
      ...base,
      placeholder: "请在此输入答案，建议分点作答。",
      maxLength: 500,
      tip: question.analysis?.trim() || "简答题支持续做，系统会保留你上次填写的内容。",
    };
  }

  return base;
}

// ==================== 随机抽题 ====================

/**
 * 从指定教材中每种题型随机抽取 5 题
 * @param {string} textbookId
 * @returns {Promise<string[]>} 题目 ID 数组（顺序：单选→多选→判断→填空→简答）
 */
async function sampleQuestionIdsByType(textbookId) {
  console.log(TAG + " sampleQuestionIdsByType — textbookId: " + textbookId);

  const bigTextbookId = BigInt(textbookId);
  const prisma = require("../utils/prisma");
  const sampledIds = [];

  for (const questionType of RANDOM_QUESTION_TYPES) {
    const rows = await prisma.quizQuestion.findMany({
      where: { textbookId: bigTextbookId, type: questionType },
      select: { id: true },
    });

    const shuffled = shuffleArray(rows);
    const selected = shuffled.slice(0, RANDOM_QUESTIONS_PER_TYPE);

    for (const row of selected) {
      sampledIds.push(row.id.toString());
    }
  }

  console.log(TAG + " sampleQuestionIdsByType — 抽取完成，共 " + sampledIds.length + " 题");
  return sampledIds;
}

/**
 * 按顺序获取题库所有题目 ID（保持入库顺序）
 * @param {string} textbookId
 * @returns {Promise<string[]>} 题目 ID 数组（按 id 升序排列）
 */
async function getAllQuestionIds(textbookId) {
  console.log(TAG + " getAllQuestionIds — textbookId: " + textbookId);

  const bigTextbookId = BigInt(textbookId);
  const prisma = require("../utils/prisma");
  const rows = await prisma.quizQuestion.findMany({
    where: { textbookId: bigTextbookId },
    select: { id: true },
    orderBy: { id: "asc" }, // 按入库顺序排列
  });

  const ids = rows.map((r) => r.id.toString());
  console.log(TAG + " getAllQuestionIds — 共 " + ids.length + " 题");
  return ids;
}

// ==================== 公开 API ====================

/**
 * 批量查询教材的随机刷题会话状态
 * @param {string} userId
 * @param {string[]} textbookIds
 * @returns {Promise<Array>}
 */
async function getRandomSessionStatus(userId, textbookIds) {
  if (!textbookIds || textbookIds.length === 0) return [];

  console.log(TAG + " getRandomSessionStatus — userId: " + userId + ", textbookIds: " + textbookIds.join(","));

  return await quizRepo.getRandomSessionStatusBatch(userId, textbookIds);
}

/**
 * 开始或继续随机刷题
 * @param {string} userId
 * @param {string} textbookId
 * @returns {Promise<Object>}
 */
async function startRandomSession(userId, textbookId) {
  console.log(TAG + " startRandomSession — userId: " + userId + ", textbookId: " + textbookId);

  // 1. 检查题库是否存在
  const textbookResult = await quizRepo.getTextbookDetail(textbookId, userId);
  if (textbookResult.code !== 200) {
    throw new Error("TEXTBOOK_NOT_FOUND");
  }
  const textbook = textbookResult.data;

  // 2. 检查是否存在进行中的会话
  const existingSession = await quizRepo.findActiveRandomSession(userId, textbookId);
  if (existingSession) {
    console.log(TAG + " 命中未完成会话，返回继续 — sessionId: " + existingSession.id);
    return {
      sessionId: existingSession.id.toString(),
      textbookId: textbook.id.toString(),
      textbookName: textbook.name,
      totalCount: existingSession.totalCount,
      status: existingSession.status,
      createdFrom: "existing",
    };
  }

  // 3. 随机抽取题目
  const sampledIds = await sampleQuestionIdsByType(textbookId);
  if (sampledIds.length === 0) {
    throw new Error("NO_QUESTIONS_AVAILABLE");
  }

  // 4. 创建新会话
  const session = await quizRepo.createQuizSession({
    userId,
    textbookId,
    examId: null,
    mode: "RANDOM",
    questionIds: sampledIds,
    totalCount: sampledIds.length,
  });

  console.log(TAG + " 智能刷题会话创建成功 — sessionId: " + session.id + ", 题目数: " + sampledIds.length);

  return {
    sessionId: session.id.toString(),
    textbookId: textbook.id.toString(),
    textbookName: textbook.name,
    totalCount: session.totalCount,
    status: session.status,
    createdFrom: "new",
  };
}

/**
 * 开始或继续顺序刷题（按题目原始顺序出全部题目）
 * @param {string} userId
 * @param {string} textbookId
 * @returns {Promise<Object>}
 */
async function startSequentialSession(userId, textbookId) {
  console.log(TAG + " startSequentialSession — userId: " + userId + ", textbookId: " + textbookId);

  // 1. 检查题库是否存在
  const textbookResult = await quizRepo.getTextbookDetail(textbookId, userId);
  if (textbookResult.code !== 200) {
    throw new Error("TEXTBOOK_NOT_FOUND");
  }
  const textbook = textbookResult.data;

  // 2. 检查是否存在进行中的顺序刷题会话
  const existingSession = await quizRepo.findActiveSequentialSession(userId, textbookId);
  if (existingSession) {
    console.log(TAG + " 命中未完成顺序刷题会话，返回继续 — sessionId: " + existingSession.id);
    return {
      sessionId: existingSession.id.toString(),
      textbookId: textbook.id.toString(),
      textbookName: textbook.name,
      totalCount: existingSession.totalCount,
      status: existingSession.status,
      createdFrom: "existing",
    };
  }

  // 3. 按顺序获取所有题目
  const allIds = await getAllQuestionIds(textbookId);
  if (allIds.length === 0) {
    throw new Error("NO_QUESTIONS_AVAILABLE");
  }

  // 4. 创建新会话
  const session = await quizRepo.createQuizSession({
    userId,
    textbookId,
    examId: null,
    mode: "SEQUENTIAL",
    questionIds: allIds,
    totalCount: allIds.length,
  });

  console.log(TAG + " 顺序刷题会话创建成功 — sessionId: " + session.id + ", 题目数: " + allIds.length);

  return {
    sessionId: session.id.toString(),
    textbookId: textbook.id.toString(),
    textbookName: textbook.name,
    totalCount: session.totalCount,
    status: session.status,
    createdFrom: "new",
  };
}

/**
 * 获取会话详情（含题目列表、作答映射、题型统计）
 * @param {string} userId
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
async function getRandomSessionDetail(userId, sessionId) {
  console.log(TAG + " getRandomSessionDetail — sessionId: " + sessionId);

  // 1. 获取会话
  const session = await quizRepo.getSessionDetail(sessionId, userId);
  if (!session) throw new Error("SESSION_NOT_FOUND");

  // 2. 解析题目 ID 数组
  const questionIds = session.questionIds || [];
  const orderedIds = questionIds
    .map((id) => {
      try { return BigInt(String(id)); } catch (_) { return null; }
    })
    .filter(Boolean);

  if (orderedIds.length === 0) throw new Error("SESSION_HAS_NO_QUESTIONS");

  // 3. 查询题目数据
  const questionRows = await quizRepo.getSessionQuestions(orderedIds);
  const questionMap = new Map();
  for (const q of questionRows) {
    questionMap.set(q.id.toString(), q);
  }

  // 4. 按顺序构建题目视图 + 统计题型
  const orderedQuestions = [];
  const typeCounts = { single: 0, multiple: 0, judge: 0, fill: 0, essay: 0 };

  for (let i = 0; i < orderedIds.length; i++) {
    const q = questionMap.get(orderedIds[i].toString());
    if (!q) continue;

    const frontendType = mapToFrontendType(q.type);
    typeCounts[frontendType]++;

    orderedQuestions.push(buildQuestionView(q, i + 1, session.textbook?.name || "智能刷题"));
  }

  if (orderedQuestions.length === 0) throw new Error("SESSION_HAS_NO_VALID_QUESTIONS");

  // 5. 构建作答映射
  const answerMap = {};
  for (const ua of session.userAnswers) {
    const q = questionMap.get(ua.questionId.toString());
    if (!q) continue;
    answerMap[ua.questionId.toString()] = deserializeAnswer(q.type, ua.userAnswer);
  }

  const currentIndex = clampIndex(session.currentQuestionIndex, orderedQuestions.length);

  console.log(TAG + " 会话详情返回 — 题目: " + orderedQuestions.length + ", 已答: " + Object.keys(answerMap).length);

  return {
    sessionId: session.id.toString(),
    textbookId: session.textbookId?.toString() || "",
    textbookName: session.textbook?.name || "智能刷题",
    status: session.status,
    totalCount: orderedQuestions.length,
    answeredCount: Object.keys(answerMap).length,
    currentQuestionIndex: currentIndex,
    questions: orderedQuestions,
    answers: answerMap,
    typeCounts,
  };
}

/**
 * 保存刷题进度（含作答保存和判题）
 * @param {string} userId
 * @param {string} sessionId
 * @param {{currentQuestionIndex: number, questionId?: string, answer?: any}} payload
 * @returns {Promise<{sessionId: string, currentQuestionIndex: number}>}
 */
async function saveRandomSessionProgress(userId, sessionId, payload) {
  console.log(TAG + " saveRandomSessionProgress — sessionId: " + sessionId);

  // 1. 获取会话并校验
  const session = await quizRepo.getSessionDetail(sessionId, userId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status !== "IN_PROGRESS") throw new Error("SESSION_NOT_ACTIVE");

  const questionIds = (session.questionIds || [])
    .map((id) => {
      try { return BigInt(String(id)); } catch (_) { return null; }
    })
    .filter(Boolean);

  const currentIndex = clampIndex(payload.currentQuestionIndex, questionIds.length);

  // 2. 更新会话位置
  await quizRepo.updateSessionPosition(BigInt(sessionId), currentIndex);

  // 3. 如果没有提交答案，仅保存位置
  if (!payload.questionId) {
    console.log(TAG + " 仅保存位置 — index: " + currentIndex);
    return { sessionId, currentQuestionIndex: currentIndex };
  }

  // 4. 校验题目是否在会话中
  const parsedQuestionId = BigInt(payload.questionId);
  const isInSession = questionIds.some((id) => id === parsedQuestionId);
  if (!isInSession) throw new Error("QUESTION_NOT_IN_SESSION");

  // 5. 获取题目信息（含答案）
  const question = await quizRepo.getQuestionWithAnswer(parsedQuestionId);
  if (!question) throw new Error("QUESTION_NOT_FOUND");

  // 6. 序列化用户答案
  const serialized = serializeAnswer(question.type, payload.answer);

  // 7. 如果答案为空 → 删除作答记录
  if (!serialized) {
    await quizRepo.deleteUserAnswer({
      userId,
      questionId: payload.questionId,
      sessionId,
    });

    console.log(TAG + " 清空作答 — questionId: " + payload.questionId);
    return { sessionId, currentQuestionIndex: currentIndex };
  }

  // 8. 判题
  const isCorrect = evaluateAnswer({
    questionType: question.type,
    correctAnswer: question.answer,
    userAnswer: payload.answer,
  });

  // 9. 保存作答
  await quizRepo.upsertUserAnswer({
    userId,
    questionId: payload.questionId,
    sessionId,
    userAnswer: serialized,
    isCorrect,
  });

  // 10. 更新错题本
  await quizRepo.upsertWrongQuestion({
    userId,
    questionId: payload.questionId,
    textbookId: question.textbookId.toString(),
    isCorrect,
  });

  console.log(TAG + " 作答已保存 — questionId: " + payload.questionId + ", correct: " + isCorrect);

  // 记录每日活动（不阻塞响应，失败不影响主流程）
  activityRepo.recordDailyActivity(userId).catch((err) => {
    console.error(TAG + " 记录每日活动失败（非关键）: " + err.message);
  });

  return { sessionId, currentQuestionIndex: currentIndex };
}

/**
 * 交卷 → 完成会话 + 生成报告
 * @param {string} userId
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
async function completeRandomSession(userId, sessionId) {
  console.log(TAG + " completeRandomSession — sessionId: " + sessionId);

  // 1. 获取会话
  const session = await quizRepo.getSessionDetail(sessionId, userId);
  if (!session) throw new Error("SESSION_NOT_FOUND");

  if (session.status !== "IN_PROGRESS") {
    // 已经完成，检查是否有报告
    const existingReport = await require("../repo/quiz_repo").getReportDetail(sessionId, userId);
    if (existingReport) {
      return {
        sessionId: session.id.toString(),
        status: session.status,
        reportId: existingReport.id.toString(),
        reportStatus: existingReport.status,
      };
    }
    throw new Error("SESSION_NOT_ACTIVE");
  }

  // 2. 统计
  const answeredCount = await quizRepo.countSessionAnswers(BigInt(sessionId), BigInt(userId));

  // 3. 生成报告
  const reportService = require("./quiz_report_service");
  const report = await reportService.createQuizReport(userId, sessionId);

  console.log(TAG + " 交卷完成 — answerCount: " + answeredCount + ", reportId: " + report.reportId);

  // 记录每日活动（不阻塞响应，失败不影响主流程）
  activityRepo.recordDailyActivity(userId).catch((err) => {
    console.error(TAG + " 记录每日活动失败（非关键）: " + err.message);
  });

  return {
    sessionId: session.id.toString(),
    status: "COMPLETED",
    reportId: report.reportId,
    reportStatus: report.status,
  };
}

// ==================== 基于试卷的刷题会话 ====================

/**
 * 基于试卷开始顺序刷题（按 sortOrder 升序出题）
 * @param {string} userId - 用户ID
 * @param {string} examId - 试卷ID
 * @returns {Promise<{sessionId, examId, examName, totalCount, status, createdFrom}>}
 */
async function startExamSequentialSession(userId, examId) {
  console.log(TAG + " startExamSequentialSession — userId: " + userId + ", examId: " + examId);

  // 1. 验证试卷存在
  const prisma = require("../utils/prisma");
  const exam = await prisma.quizExam.findFirst({
    where: { id: BigInt(examId) },
    include: { textbook: { select: { id: true, name: true } } },
  });

  if (!exam) {
    throw new Error("EXAM_NOT_FOUND");
  }

  const textbookId = exam.textbookId.toString();
  const textbookName = exam.textbook?.name || "未知题库";

  // 2. 检查是否存在进行中的顺序刷题会话
  const existingSession = await quizRepo.findActiveExamSession(userId, examId, "SEQUENTIAL");
  if (existingSession) {
    console.log(TAG + " 命中未完成顺序刷题会话 — sessionId: " + existingSession.id);
    return {
      sessionId: existingSession.id.toString(),
      examId: examId,
      examName: exam.name,
      textbookId: textbookId,
      textbookName: textbookName,
      totalCount: existingSession.totalCount,
      status: existingSession.status,
      createdFrom: "existing",
    };
  }

  // 3. 按顺序获取试卷下所有题目
  const allIds = await quizRepo.getAllQuestionIdsByExamId(examId);
  if (allIds.length === 0) {
    throw new Error("NO_QUESTIONS_AVAILABLE");
  }

  // 4. 创建新会话
  const session = await quizRepo.createQuizSession({
    userId,
    textbookId,
    examId,
    mode: "SEQUENTIAL",
    questionIds: allIds,
    totalCount: allIds.length,
  });

  console.log(TAG + " 顺序刷题会话创建成功（试卷维度）— sessionId: " + session.id + ", 题目数: " + allIds.length);

  return {
    sessionId: session.id.toString(),
    examId: examId,
    examName: exam.name,
    textbookId: textbookId,
    textbookName: textbookName,
    totalCount: session.totalCount,
    status: session.status,
    createdFrom: "new",
  };
}

/**
 * 基于试卷开始随机刷题（每种题型随机抽取最多5题）
 * @param {string} userId - 用户ID
 * @param {string} examId - 试卷ID
 * @returns {Promise<{sessionId, examId, examName, totalCount, status, createdFrom}>}
 */
async function startExamRandomSession(userId, examId) {
  console.log(TAG + " startExamRandomSession — userId: " + userId + ", examId: " + examId);

  // 1. 验证试卷存在
  const prisma = require("../utils/prisma");
  const exam = await prisma.quizExam.findFirst({
    where: { id: BigInt(examId) },
    include: { textbook: { select: { id: true, name: true } } },
  });

  if (!exam) {
    throw new Error("EXAM_NOT_FOUND");
  }

  const textbookId = exam.textbookId.toString();
  const textbookName = exam.textbook?.name || "未知题库";

  // 2. 检查是否存在进行中的随机刷题会话
  const existingSession = await quizRepo.findActiveExamSession(userId, examId, "RANDOM");
  if (existingSession) {
    console.log(TAG + " 命中未完成随机刷题会话 — sessionId: " + existingSession.id);
    return {
      sessionId: existingSession.id.toString(),
      examId: examId,
      examName: exam.name,
      textbookId: textbookId,
      textbookName: textbookName,
      totalCount: existingSession.totalCount,
      status: existingSession.status,
      createdFrom: "existing",
    };
  }

  // 3. 按题型随机抽取题目
  const sampledIds = await quizRepo.sampleQuestionIdsByExamId(examId);
  if (sampledIds.length === 0) {
    throw new Error("NO_QUESTIONS_AVAILABLE");
  }

  // 4. 创建新会话
  const session = await quizRepo.createQuizSession({
    userId,
    textbookId,
    examId,
    mode: "RANDOM",
    questionIds: sampledIds,
    totalCount: sampledIds.length,
  });

  console.log(TAG + " 随机刷题会话创建成功（试卷维度）— sessionId: " + session.id + ", 题目数: " + sampledIds.length);

  return {
    sessionId: session.id.toString(),
    examId: examId,
    examName: exam.name,
    textbookId: textbookId,
    textbookName: textbookName,
    totalCount: session.totalCount,
    status: session.status,
    createdFrom: "new",
  };
}

module.exports = {
  getRandomSessionStatus,
  startRandomSession,
  getRandomSessionDetail,
  saveRandomSessionProgress,
  completeRandomSession,
  // 顺序刷题（start 为独立实现，detail/progress/complete 复用随机模式相同逻辑）
  startSequentialSession,
  getSequentialSessionDetail: getRandomSessionDetail,
  saveSequentialSessionProgress: saveRandomSessionProgress,
  completeSequentialSession: completeRandomSession,
  // 基于试卷的刷题
  startExamSequentialSession,
  startExamRandomSession,
  // 工具函数（公开考试服务复用）
  evaluateAnswer,
  serializeAnswer,
  deserializeAnswer,
  buildQuestionView,
  mapToFrontendType,
  parseOptions,
  shuffleArray,
  RANDOM_QUESTIONS_PER_TYPE,
};
