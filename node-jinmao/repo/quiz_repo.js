// ==================== 题库数据访问层 ====================
// 职责：封装 Quiz 相关所有数据库操作，提供统一的 CRUD 接口
// 所有方法返回标准格式 { code, data, message }，与现有 repo 层风格一致

const prisma = require("../utils/prisma");

// 日志前缀
const TAG = "[quiz_repo]";

// ==================== 题库（QuizTextbook）操作 ====================

/**
 * 分页查询用户的题库列表
 * @param {string} userId - 用户ID（BigInt 字符串形式）
 * @param {number} page - 页码（1-based）
 * @param {number} pageSize - 每页条数
 * @param {string} [keyword] - 搜索关键词（模糊匹配题库名称）
 * @returns {Promise<{code: number, data: {items, total, page, pageSize}, message: string}>}
 */
async function listTextbooks(userId, page, pageSize, keyword) {
  console.log(TAG + " listTextbooks — userId: " + userId + ", page: " + page + ", keyword: " + (keyword || "无"));

  try {
    const bigUserId = BigInt(userId);
    // 构建 where 条件
    const where = {
      userId: bigUserId,
      isDeleted: false,
    };

    // 关键词模糊搜索（匹配题库名称）
    if (keyword && keyword.trim()) {
      where.name = { contains: keyword.trim() };
    }

    // 并发查询总数和分页数据
    const [total, items] = await Promise.all([
      prisma.quizTextbook.count({ where }),
      prisma.quizTextbook.findMany({
        where,
        orderBy: { updateTime: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    console.log(TAG + " listTextbooks — 查询成功，共 " + total + " 条，当前页 " + items.length + " 条");

    return {
      code: 200,
      data: { items, total, page, pageSize },
      message: "查询成功",
    };
  } catch (error) {
    console.error(TAG + " listTextbooks — 查询失败: " + error.message);
    return { code: 500, data: null, message: "查询题库列表失败: " + error.message };
  }
}

/**
 * 获取题库详情（含试卷列表和题目总数统计）
 * @param {string} textbookId - 题库ID
 * @param {string} userId - 用户ID（用于鉴权）
 * @returns {Promise<{code: number, data: object|null, message: string}>}
 */
async function getTextbookDetail(textbookId, userId) {
  console.log(TAG + " getTextbookDetail — textbookId: " + textbookId);

  try {
    const bigId = BigInt(textbookId);
    const bigUserId = BigInt(userId);

    const textbook = await prisma.quizTextbook.findFirst({
      where: { id: bigId, userId: bigUserId, isDeleted: false },
      include: {
        exams: {
          orderBy: { createTime: "asc" },
          select: {
            id: true,
            name: true,
            questionCount: true,
            createTime: true,
          },
        },
      },
    });

    if (!textbook) {
      return { code: 404, data: null, message: "题库不存在或无权访问" };
    }

    console.log(TAG + " getTextbookDetail — 查询成功: " + textbook.name);
    return { code: 200, data: textbook, message: "查询成功" };
  } catch (error) {
    console.error(TAG + " getTextbookDetail — 查询失败: " + error.message);
    return { code: 500, data: null, message: "查询题库详情失败: " + error.message };
  }
}

/**
 * 软删除题库（同时删除关联的试卷、题目、会话、报告）
 * @param {string} textbookId - 题库ID
 * @param {string} userId - 用户ID
 * @returns {Promise<{code: number, data: null, message: string}>}
 */
async function deleteTextbook(textbookId, userId) {
  console.log(TAG + " deleteTextbook — textbookId: " + textbookId);

  try {
    const bigId = BigInt(textbookId);
    const bigUserId = BigInt(userId);

    // 先确认题库存在且属于该用户
    const textbook = await prisma.quizTextbook.findFirst({
      where: { id: bigId, userId: bigUserId, isDeleted: false },
    });

    if (!textbook) {
      return { code: 404, data: null, message: "题库不存在或无权操作" };
    }

    // 使用事务级联删除关联数据，然后软删除题库
    await prisma.$transaction([
      // 删除报告题目明细（通过关联的报告）
      prisma.quizReportItem.deleteMany({
        where: { report: { textbookId: bigId } },
      }),
      // 删除刷题报告
      prisma.quizReport.deleteMany({
        where: { textbookId: bigId },
      }),
      // 删除作答记录
      prisma.quizUserAnswer.deleteMany({
        where: { question: { textbookId: bigId } },
      }),
      // 删除错题记录
      prisma.quizWrongQuestion.deleteMany({
        where: { textbookId: bigId },
      }),
      // 删除刷题会话
      prisma.quizSession.deleteMany({
        where: { textbookId: bigId },
      }),
      // 删除题目
      prisma.quizQuestion.deleteMany({
        where: { textbookId: bigId },
      }),
      // 删除试卷
      prisma.quizExam.deleteMany({
        where: { textbookId: bigId },
      }),
      // 软删除题库
      prisma.quizTextbook.update({
        where: { id: bigId },
        data: { isDeleted: true },
      }),
    ]);

    console.log(TAG + " deleteTextbook — 删除成功");
    return { code: 200, data: null, message: "题库已删除" };
  } catch (error) {
    console.error(TAG + " deleteTextbook — 删除失败: " + error.message);
    return { code: 500, data: null, message: "删除题库失败: " + error.message };
  }
}

// ==================== 导入操作 ====================

/**
 * 事务性创建教材和试卷基础数据
 * @param {string} textbookName - 题库名称
 * @param {string} examName - 试卷名称
 * @param {string} userId - 用户ID
 * @param {string} [description] - 题库描述
 * @returns {Promise<{textbookId: bigint, examId: bigint}>}
 */
async function createTextbookAndExam(textbookName, examName, userId, description) {
  const bigUserId = BigInt(userId);

  const result = await prisma.$transaction(async (tx) => {
    const textbook = await tx.quizTextbook.create({
      data: {
        userId: bigUserId,
        name: textbookName,
        description: description || null,
        totalQuestions: 0,
        totalExams: 1,
      },
    });

    const exam = await tx.quizExam.create({
      data: {
        textbookId: textbook.id,
        name: examName,
        questionCount: 0,
      },
    });

    return { textbookId: textbook.id, examId: exam.id };
  });

  console.log(TAG + " createTextbookAndExam — 创建成功，textbookId: " + result.textbookId + ", examId: " + result.examId);
  return result;
}

/**
 * 批量写入题目
 * @param {bigint} textbookId - 题库ID
 * @param {bigint} examId - 试卷ID
 * @param {Array<Object>} questions - 解析后的题目数组
 * @returns {Promise<number>} 成功导入的题目数量
 */
async function batchCreateQuestions(textbookId, examId, questions) {
  let importedCount = 0;

  for (const q of questions) {
    try {
      await prisma.quizQuestion.create({
        data: {
          examId,
          textbookId,
          type: q.type,
          content: q.content,
          options: q.options || undefined,
          answer: q.answer,
          analysis: q.analysis,
          sortOrder: q.sortOrder,
        },
      });
      importedCount++;
    } catch (error) {
      console.error(TAG + " batchCreateQuestions — 单题写入失败: " + error.message);
    }
  }

  console.log(TAG + " batchCreateQuestions — 成功导入 " + importedCount + " 题");
  return importedCount;
}

/**
 * 更新题库和试卷的题目计数
 * @param {bigint} textbookId - 题库ID
 * @param {bigint} examId - 试卷ID
 * @param {number} count - 题目数量
 */
async function updateQuestionCounts(textbookId, examId, count) {
  await prisma.$transaction([
    prisma.quizExam.update({
      where: { id: examId },
      data: { questionCount: count },
    }),
    prisma.quizTextbook.update({
      where: { id: textbookId },
      data: { totalQuestions: count, totalExams: 1 },
    }),
  ]);

  console.log(TAG + " updateQuestionCounts — 计数值已更新: " + count);
}

/**
 * 清理空导入（没有任何成功入库的题目时，删除已创建的空教材和试卷）
 * @param {bigint} textbookId
 * @param {bigint} examId
 */
async function cleanupEmptyImport(textbookId, examId) {
  await prisma.$transaction([
    prisma.quizExam.delete({ where: { id: examId } }),
    prisma.quizTextbook.delete({ where: { id: textbookId } }),
  ]);
  console.log(TAG + " cleanupEmptyImport — 已清理空导入数据");
}

// ==================== 会话操作 ====================

/**
 * 根据教材ID查询进行中的随机刷题会话
 * @param {string} userId - 用户ID
 * @param {string} textbookId - 题库ID
 * @returns {Promise<Object|null>} 会话对象或 null
 */
async function findActiveRandomSession(userId, textbookId) {
  const bigUserId = BigInt(userId);
  const bigTextbookId = BigInt(textbookId);

  const session = await prisma.quizSession.findFirst({
    where: {
      userId: bigUserId,
      textbookId: bigTextbookId,
      mode: "RANDOM",
      status: "IN_PROGRESS",
    },
    orderBy: { updateTime: "desc" },
  });

  return session;
}

/**
 * 批量查询多本教材的进行中会话状态
 * @param {string} userId - 用户ID
 * @param {string[]} textbookIds - 题库ID数组
 * @returns {Promise<Array<{textbookId: string, hasActiveSession: boolean, sessionId: string|null}>>}
 */
async function getRandomSessionStatusBatch(userId, textbookIds) {
  const bigUserId = BigInt(userId);
  const bigTextbookIds = textbookIds.map((id) => BigInt(id));

  const activeSessions = await prisma.quizSession.findMany({
    where: {
      userId: bigUserId,
      textbookId: { in: bigTextbookIds },
      mode: "RANDOM",
      status: "IN_PROGRESS",
    },
    orderBy: { updateTime: "desc" },
    select: {
      id: true,
      textbookId: true,
      updatedAt: true,
    },
  });

  // 构建 Map，每个教材只保留最新的一个会话
  const sessionMap = new Map();
  for (const session of activeSessions) {
    const tid = session.textbookId.toString();
    if (!sessionMap.has(tid)) {
      sessionMap.set(tid, {
        sessionId: session.id.toString(),
        updatedAt: session.updatedAt.toISOString(),
      });
    }
  }

  return bigTextbookIds.map((tid) => {
    const strId = tid.toString();
    const session = sessionMap.get(strId);
    return {
      textbookId: strId,
      hasActiveSession: !!session,
      sessionId: session ? session.sessionId : null,
      updatedAt: session ? session.updatedAt : null,
    };
  });
}

/**
 * 创建刷题会话
 * @param {Object} params
 * @returns {Promise<Object>} 创建的会话对象
 */
async function createQuizSession({ userId, textbookId, examId, mode, questionIds, totalCount }) {
  const bigUserId = BigInt(userId);
  const bigTextbookId = textbookId ? BigInt(textbookId) : null;
  const bigExamId = examId ? BigInt(examId) : null;

  const session = await prisma.quizSession.create({
    data: {
      userId: bigUserId,
      textbookId: bigTextbookId,
      examId: bigExamId,
      mode,
      questionIds: questionIds, // Prisma 自动序列化 JSON
      totalCount,
      correctCount: 0,
      currentQuestionIndex: 1,
      status: "IN_PROGRESS",
    },
  });

  return session;
}

/**
 * 获取会话详情（含题目、已作答映射）
 * @param {string} sessionId - 会话ID
 * @param {string} userId - 用户ID（鉴权）
 * @returns {Promise<Object|null>}
 */
async function getSessionDetail(sessionId, userId) {
  const bigSessionId = BigInt(sessionId);
  const bigUserId = BigInt(userId);

  const session = await prisma.quizSession.findFirst({
    where: {
      id: bigSessionId,
      userId: bigUserId,
    },
    include: {
      textbook: {
        select: { id: true, name: true },
      },
      userAnswers: true,
    },
  });

  return session;
}

/**
 * 更新会话当前位置
 * @param {bigint} sessionId
 * @param {number} currentQuestionIndex
 */
async function updateSessionPosition(sessionId, currentQuestionIndex) {
  await prisma.quizSession.update({
    where: { id: sessionId },
    data: {
      currentQuestionIndex,
      lastAnsweredAt: new Date(),
    },
  });
}

/**
 * 获取会话的所有题目（按存储的顺序）
 * @param {bigint[]} questionIds - 题目ID数组
 * @returns {Promise<Array>}
 */
async function getSessionQuestions(questionIds) {
  const questions = await prisma.quizQuestion.findMany({
    where: { id: { in: questionIds } },
    select: {
      id: true,
      type: true,
      content: true,
      options: true,
      analysis: true,
    },
  });
  return questions;
}

/**
 * 获取单个题目（含答案，用于判题）
 * @param {bigint} questionId
 * @returns {Promise<Object|null>}
 */
async function getQuestionWithAnswer(questionId) {
  return await prisma.quizQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      type: true,
      answer: true,
      textbookId: true,
    },
  });
}

/**
 * 保存或更新作答记录
 * @param {Object} params
 */
async function upsertUserAnswer({ userId, questionId, sessionId, userAnswer, isCorrect }) {
  const bigUserId = BigInt(userId);
  const bigQuestionId = BigInt(questionId);
  const bigSessionId = sessionId ? BigInt(sessionId) : null;

  // 查找已有作答
  const existingAnswers = await prisma.quizUserAnswer.findMany({
    where: {
      sessionId: bigSessionId,
      userId: bigUserId,
      questionId: bigQuestionId,
    },
    orderBy: { id: "asc" },
  });

  if (existingAnswers.length === 0) {
    // 无记录 → 新建
    await prisma.quizUserAnswer.create({
      data: {
        userId: bigUserId,
        questionId: bigQuestionId,
        sessionId: bigSessionId,
        userAnswer,
        isCorrect,
        timeSpent: 0,
      },
    });
  } else {
    // 有记录 → 更新第一条，删除多余的
    const [first, ...duplicated] = existingAnswers;
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
 * 删除某道题的作答记录（用户清空了答案）
 * @param {Object} params
 */
async function deleteUserAnswer({ userId, questionId, sessionId }) {
  const bigUserId = BigInt(userId);
  const bigQuestionId = BigInt(questionId);
  const bigSessionId = BigInt(sessionId);

  await prisma.quizUserAnswer.deleteMany({
    where: {
      sessionId: bigSessionId,
      userId: bigUserId,
      questionId: bigQuestionId,
    },
  });
}

/**
 * 更新错题本：答对则删除错题记录，答错则 upsert
 * @param {Object} params
 */
async function upsertWrongQuestion({ userId, questionId, textbookId, isCorrect }) {
  const bigUserId = BigInt(userId);
  const bigQuestionId = BigInt(questionId);
  const bigTextbookId = BigInt(textbookId);

  if (isCorrect) {
    // 答对 → 删除错题记录
    await prisma.quizWrongQuestion.deleteMany({
      where: { userId: bigUserId, questionId: bigQuestionId },
    });
  } else {
    // 答错 → upsert
    await prisma.quizWrongQuestion.upsert({
      where: {
        userId_questionId: {
          userId: bigUserId,
          questionId: bigQuestionId,
        },
      },
      create: {
        userId: bigUserId,
        questionId: bigQuestionId,
        textbookId: bigTextbookId,
        wrongCount: 1,
      },
      update: {
        // wrongCount: { increment: 0 }，保持原样，不做额外累加
      },
    });
  }
}

/**
 * 完成会话（标记为 COMPLETED）
 * @param {bigint} sessionId
 * @param {number} totalCount
 * @param {number} correctCount
 * @param {number} currentQuestionIndex
 */
async function completeSession(sessionId, totalCount, correctCount, currentQuestionIndex) {
  await prisma.quizSession.update({
    where: { id: sessionId },
    data: {
      status: "COMPLETED",
      totalCount,
      correctCount,
      currentQuestionIndex,
      lastAnsweredAt: new Date(),
    },
  });
}

/**
 * 统计会话已作答数量
 * @param {bigint} sessionId
 * @param {bigint} userId
 * @returns {Promise<number>}
 */
async function countSessionAnswers(sessionId, userId) {
  return await prisma.quizUserAnswer.count({
    where: { sessionId, userId },
  });
}

// ==================== 报告操作 ====================

/**
 * 创建报告（含题目明细）
 * @param {Object} params
 * @returns {Promise<{id: bigint, status: string}>}
 */
async function createReport({ userId, sessionId, textbookId, status, totalCount, objectiveCount, essayCount, scoreObjective, scoreEssay, scoreTotal, items }) {
  const bigUserId = BigInt(userId);
  const bigSessionId = BigInt(sessionId);
  const bigTextbookId = textbookId ? BigInt(textbookId) : null;

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.quizReport.create({
      data: {
        userId: bigUserId,
        sessionId: bigSessionId,
        textbookId: bigTextbookId,
        status,
        totalCount,
        objectiveCount,
        essayCount,
        scoreObjective,
        scoreEssay,
        scoreTotal,
      },
      select: { id: true, status: true },
    });

    // 批量创建题目明细
    if (items && items.length > 0) {
      await tx.quizReportItem.createMany({
        data: items.map((item) => ({
          reportId: created.id,
          questionId: BigInt(item.questionId),
          questionType: item.questionType,
          maxScore: item.maxScore,
          score: item.score,
          isCorrect: item.isCorrect,
          userAnswer: item.userAnswer,
          referenceAnswer: item.referenceAnswer,
          status: item.status,
        })),
      });
    }

    return created;
  });

  return report;
}

/**
 * 获取报告详情
 * @param {string} reportId
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
async function getReportDetail(reportId, userId) {
  const bigReportId = BigInt(reportId);
  const bigUserId = BigInt(userId);

  const report = await prisma.quizReport.findFirst({
    where: { id: bigReportId, userId: bigUserId },
    include: {
      textbook: { select: { name: true } },
      items: {
        orderBy: { id: "asc" },
        include: {
          question: { select: { content: true } },
        },
      },
      session: {
        select: { mode: true, createTime: true },
      },
    },
  });

  return report;
}

/**
 * 报告列表
 * @param {string} userId
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<{items: Array, total: number}>}
 */
async function listReports(userId, limit, offset) {
  const bigUserId = BigInt(userId);

  const [total, rows] = await Promise.all([
    prisma.quizReport.count({ where: { userId: bigUserId } }),
    prisma.quizReport.findMany({
      where: { userId: bigUserId },
      orderBy: { updateTime: "desc" },
      skip: offset,
      take: limit,
      include: {
        textbook: { select: { name: true } },
        items: { select: { questionType: true, status: true } },
      },
    }),
  ]);

  return { total, items: rows };
}

/**
 * 最近报告（用于首页）
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function listRecentReports(userId, limit) {
  const bigUserId = BigInt(userId);

  return await prisma.quizReport.findMany({
    where: { userId: bigUserId },
    orderBy: { updateTime: "desc" },
    take: limit,
    include: {
      textbook: { select: { name: true } },
      items: { select: { questionType: true, status: true } },
    },
  });
}

/**
 * 查找报告中待批改/失败的简答题
 * @param {string} reportId
 * @returns {Promise<Array>}
 */
async function getPendingEssayItems(reportId) {
  const bigReportId = BigInt(reportId);

  return await prisma.quizReportItem.findMany({
    where: {
      reportId: bigReportId,
      questionType: "ESSAY",
      status: { in: ["PENDING", "FAILED"] },
    },
    include: {
      question: { select: { content: true, answer: true } },
    },
    orderBy: { id: "asc" },
  });
}

/**
 * 更新单个报告项的判题结果
 * @param {bigint} itemId
 * @param {Object} result
 */
async function updateReportItemScore(itemId, { status, score, aiPercent, aiCommentary }) {
  await prisma.quizReportItem.update({
    where: { id: itemId },
    data: { status, score, aiPercent: aiPercent ?? null, aiCommentary: aiCommentary ?? null },
  });
}

/**
 * 设置报告项状态为 RUNNING
 * @param {bigint} itemId
 */
async function setReportItemRunning(itemId) {
  await prisma.quizReportItem.update({
    where: { id: itemId },
    data: { status: "RUNNING" },
  });
}

/**
 * 刷新报告分数和状态
 * @param {string} reportId
 */
async function refreshReportScore(reportId) {
  const bigReportId = BigInt(reportId);

  const items = await prisma.quizReportItem.findMany({
    where: { reportId: bigReportId },
    select: { questionType: true, score: true, status: true },
  });

  let scoreObjective = 0;
  let scoreEssay = 0;
  let essayCount = 0;
  let doneEssayCount = 0;
  let hasFailedEssay = false;

  for (const item of items) {
    if (item.questionType === "ESSAY") {
      essayCount++;
      if (item.status === "DONE") {
        doneEssayCount++;
        scoreEssay += item.score;
      } else if (item.status === "FAILED") {
        hasFailedEssay = true;
      }
    } else {
      scoreObjective += item.score;
    }
  }

  let status = "COMPLETED";
  if (essayCount > 0) {
    if (hasFailedEssay) {
      status = "FAILED";
    } else if (doneEssayCount < essayCount) {
      status = "GRADING";
    }
  }

  const scoreTotal = Math.min(100, Math.max(0, scoreObjective + scoreEssay));

  await prisma.quizReport.update({
    where: { id: bigReportId },
    data: { scoreObjective, scoreEssay, scoreTotal, status },
  });

  return { scoreObjective, scoreEssay, scoreTotal, status };
}

/**
 * 查找报告基本信息
 * @param {string} reportId
 * @returns {Promise<Object|null>}
 */
async function findReportById(reportId) {
  const bigId = BigInt(reportId);
  return await prisma.quizReport.findFirst({
    where: { id: bigId },
    select: { id: true, userId: true, status: true, essayCount: true },
  });
}

// ==================== 错题本操作 ====================

/**
 * 获取用户错题概览（按教材分组统计）
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getWrongbookOverview(userId) {
  const bigUserId = BigInt(userId);

  // 获取所有错题记录，关联题库信息
  const wrongQuestions = await prisma.quizWrongQuestion.findMany({
    where: { userId: bigUserId },
    include: {
      textbook: { select: { id: true, name: true } },
      question: { select: { id: true, type: true, content: true } },
    },
    orderBy: { updateTime: "desc" },
  });

  // 按教材分组
  const grouped = {};
  for (const wq of wrongQuestions) {
    const tid = wq.textbookId.toString();
    if (!grouped[tid]) {
      grouped[tid] = {
        textbookId: wq.textbook.id.toString(),
        textbookName: wq.textbook.name,
        totalWrong: 0,
        questions: [],
      };
    }
    grouped[tid].totalWrong++;
    grouped[tid].questions.push({
      questionId: wq.questionId.toString(),
      type: wq.question.type,
      content: wq.question.content.substring(0, 100), // 截取前100字作为预览
      wrongCount: wq.wrongCount,
    });
  }

  return Object.values(grouped);
}

/**
 * 获取用户某教材的所有错题ID
 * @param {string} userId
 * @param {string} textbookId
 * @returns {Promise<bigint[]>}
 */
async function getWrongQuestionIds(userId, textbookId) {
  const bigUserId = BigInt(userId);
  const bigTextbookId = BigInt(textbookId);

  const records = await prisma.quizWrongQuestion.findMany({
    where: { userId: bigUserId, textbookId: bigTextbookId },
    select: { questionId: true },
    orderBy: { updateTime: "desc" },
  });

  return records.map((r) => r.questionId);
}

/**
 * 获取错题题目详情
 * @param {bigint[]} questionIds
 * @returns {Promise<Array>}
 */
async function getWrongQuestionsByIds(questionIds) {
  return await prisma.quizQuestion.findMany({
    where: { id: { in: questionIds } },
    select: {
      id: true,
      type: true,
      content: true,
      options: true,
      analysis: true,
    },
  });
}

module.exports = {
  // 题库
  listTextbooks,
  getTextbookDetail,
  deleteTextbook,
  // 导入
  createTextbookAndExam,
  batchCreateQuestions,
  updateQuestionCounts,
  cleanupEmptyImport,
  // 会话
  findActiveRandomSession,
  getRandomSessionStatusBatch,
  createQuizSession,
  getSessionDetail,
  updateSessionPosition,
  getSessionQuestions,
  getQuestionWithAnswer,
  upsertUserAnswer,
  deleteUserAnswer,
  upsertWrongQuestion,
  completeSession,
  countSessionAnswers,
  // 报告
  createReport,
  getReportDetail,
  listReports,
  listRecentReports,
  getPendingEssayItems,
  updateReportItemScore,
  setReportItemRunning,
  refreshReportScore,
  findReportById,
  // 错题本
  getWrongbookOverview,
  getWrongQuestionIds,
  getWrongQuestionsByIds,
};
