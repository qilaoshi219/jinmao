// ==================== 题库数据访问层 ====================
// 职责：封装 Quiz 相关所有数据库操作，提供统一的 CRUD 接口
// 所有方法返回标准格式 { code, data, message }，与现有 repo 层风格一致

const prisma = require("../utils/prisma");

// 日志前缀
const TAG = "[quiz_repo]";

// ==================== 题库（QuizTextbook）操作 ====================

/**
 * 分页查询用户的题库列表（含自建题库 + 借用的题库）
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

    // 1. 查询自己的题库（isDeleted=false）
    const ownWhere = {
      userId: bigUserId,
      isDeleted: false,
    };
    if (keyword && keyword.trim()) {
      ownWhere.name = { contains: keyword.trim() };
    }

    // 2. 查询借用的题库（通过 QuizBookBorrow 关联，题库未删除）
    const borrowWhere = {
      borrows: {
        some: {
          userId: bigUserId,
        },
      },
      isDeleted: false,
    };
    if (keyword && keyword.trim()) {
      borrowWhere.name = { contains: keyword.trim() };
    }

    // 并发查询两类题库的总数和分页数据
    const [ownTotal, ownItems, borrowTotal, borrowItems] = await Promise.all([
      prisma.quizTextbook.count({ where: ownWhere }),
      prisma.quizTextbook.findMany({
        where: ownWhere,
        orderBy: { updateTime: "desc" },
        select: {
          id: true,
          userId: true,
          name: true,
          description: true,
          totalQuestions: true,
          totalExams: true,
          createTime: true,
          updateTime: true,
          generatingTaskId: true,
          isShared: true,
        },
      }),
      prisma.quizTextbook.count({ where: borrowWhere }),
      prisma.quizTextbook.findMany({
        where: borrowWhere,
        orderBy: { updateTime: "desc" },
        include: {
          user: { select: { nickname: true } },
        },
      }),
    ]);

    // 合并结果：自建在前，借用在后；各标注 ownType
    const ownMapped = ownItems.map((tb) => ({
      ...tb,
      ownType: "own",
      creatorNickname: null,
    }));
    const borrowMapped = borrowItems.map((tb) => ({
      ...tb,
      ownType: "borrowed",
      creatorNickname: tb.user?.nickname || null,
      user: undefined, // 移除多余的 user include
    }));

    const allItems = [...ownMapped, ...borrowMapped];
    const totalCount = ownTotal + borrowTotal;

    // 应用分页（内存分页，因为两类数据需合并排序）
    allItems.sort((a, b) => new Date(b.updateTime) - new Date(a.updateTime));
    const pagedItems = allItems.slice((page - 1) * pageSize, page * pageSize);

    console.log(TAG + " listTextbooks — 查询成功，自建 " + ownTotal + " 条，借用 " + borrowTotal + " 条，当前页 " + pagedItems.length + " 条");

    return {
      code: 200,
      data: { items: pagedItems, total: totalCount, page, pageSize },
      message: "查询成功",
    };
  } catch (error) {
    console.error(TAG + " listTextbooks — 查询失败: " + error.message);
    return { code: 500, data: null, message: "查询题库列表失败: " + error.message };
  }
}

/**
 * 获取题库详情（含试卷列表和题目总数统计）
 * 权限：自己的题库、已借用的题库、或共享题库均可查看
 * @param {string} textbookId - 题库ID
 * @param {string} userId - 用户ID（用于鉴权 + 判断 ownType）
 * @returns {Promise<{code: number, data: object|null, message: string}>}
 */
async function getTextbookDetail(textbookId, userId) {
  console.log(TAG + " getTextbookDetail — textbookId: " + textbookId);

  try {
    const bigId = BigInt(textbookId);
    const bigUserId = BigInt(userId);

    const textbook = await prisma.quizTextbook.findFirst({
      where: { id: bigId, isDeleted: false },
      include: {
        user: { select: { id: true, nickname: true } },
        exams: {
          orderBy: { createTime: "asc" },
          select: {
            id: true,
            name: true,
            questionCount: true,
            createTime: true,
          },
        },
        _count: {
          select: { borrows: { where: { userId: bigUserId } } },
        },
      },
    });

    if (!textbook) {
      return { code: 404, data: null, message: "题库不存在或无权访问" };
    }

    // 判断 ownType：自己创建的 / 已借用的 / 共享的
    const isOwner = textbook.userId === bigUserId;
    const isBorrowed = textbook._count.borrows > 0;
    const isShared = textbook.isShared;

    // 权限检查：所有者、借用者、或市场可见
    if (!isOwner && !isBorrowed && !isShared) {
      return { code: 404, data: null, message: "题库不存在或无权访问" };
    }

    // 计算 ownType
    let ownType = "market"; // 市场浏览（未借用）
    if (isOwner) ownType = "own";
    else if (isBorrowed) ownType = "borrowed";

    console.log(TAG + " getTextbookDetail — 查询成功: " + textbook.name + ", ownType: " + ownType);

    return {
      code: 200,
      data: {
        ...textbook,
        ownType,
        creatorNickname: textbook.user?.nickname || null,
        _count: undefined,
      },
      message: "查询成功",
    };
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
      // 删除借用记录（确保借用者不会再看到该题库）
      prisma.quizBookBorrow.deleteMany({
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

/**
 * 删除单个试卷（含级联删除关联数据）
 * 若删除后题库试卷数为 0，则连题库一起删除
 * @param {string} examId - 试卷ID
 * @param {string} userId - 用户ID（用于鉴权）
 * @returns {Promise<{code: number, data: {deletedTextbook: boolean}|null, message: string}>}
 */
async function deleteExam(examId, userId) {
  console.log(TAG + " deleteExam — examId: " + examId + ", userId: " + userId);

  try {
    const bigExamId = BigInt(examId);
    const bigUserId = BigInt(userId);

    // 1. 查找试卷，联查 textbook 确认存在且用户有所有权
    const exam = await prisma.quizExam.findFirst({
      where: { id: bigExamId },
      include: {
        textbook: { select: { id: true, userId: true, isDeleted: false } },
      },
    });

    if (!exam) {
      return { code: 404, data: null, message: "试卷不存在" };
    }

    if (exam.textbook.userId !== bigUserId) {
      return { code: 404, data: null, message: "试卷不存在或无权操作" };
    }

    if (exam.textbook.isDeleted) {
      return { code: 404, data: null, message: "试卷关联的题库已被删除" };
    }

    const textbookId = exam.textbookId;
    const questionCount = exam.questionCount;

    console.log(TAG + " deleteExam — 试卷名: " + exam.name + ", 题数: " + questionCount + ", textbookId: " + textbookId);

    // 2. 事务：级联删除试卷关联的所有数据
    await prisma.$transaction([
      // 删除该试卷的公开考试发布记录（含其作答会话，外键 SET NULL 不阻塞）
      prisma.publicExam.deleteMany({
        where: { examId: bigExamId },
      }),
      // 删除与该试卷题目关联的报告题目明细
      prisma.quizReportItem.deleteMany({
        where: { question: { examId: bigExamId } },
      }),
      // 删除与该试卷关联的刷题报告（通过 session）
      prisma.quizReport.deleteMany({
        where: { session: { examId: bigExamId } },
      }),
      // 删除与该试卷题目关联的作答记录
      prisma.quizUserAnswer.deleteMany({
        where: { question: { examId: bigExamId } },
      }),
      // 删除与该试卷题目关联的错题记录
      prisma.quizWrongQuestion.deleteMany({
        where: { question: { examId: bigExamId } },
      }),
      // 删除与该试卷关联的刷题会话
      prisma.quizSession.deleteMany({
        where: { examId: bigExamId },
      }),
      // 删除该试卷的所有题目
      prisma.quizQuestion.deleteMany({
        where: { examId: bigExamId },
      }),
      // 删除试卷本身
      prisma.quizExam.delete({
        where: { id: bigExamId },
      }),
    ]);

    console.log(TAG + " deleteExam — 试卷及关联数据已删除");

    // 3. 统计该题库剩余试卷数
    const remainingExamCount = await prisma.quizExam.count({
      where: { textbookId },
    });

    console.log(TAG + " deleteExam — 剩余试卷数: " + remainingExamCount);

    // 4. 若剩余试卷数 == 0，连题库一起删除
    if (remainingExamCount === 0) {
      console.log(TAG + " deleteExam — 题库试卷数为0，执行整库删除");
      // 直接软删除题库：题库的试卷/题目已在上述事务中删除，剩余关联数据需额外清理
      await prisma.$transaction([
        // 删除题库下的公开考试发布记录
        prisma.publicExam.deleteMany({
          where: { exam: { textbookId } },
        }),
        // 删除题库级别的关联数据（可能未在试卷级联中覆盖）
        prisma.quizReportItem.deleteMany({
          where: { report: { textbookId } },
        }),
        prisma.quizReport.deleteMany({
          where: { textbookId },
        }),
        prisma.quizUserAnswer.deleteMany({
          where: { question: { textbookId } },
        }),
        prisma.quizWrongQuestion.deleteMany({
          where: { textbookId },
        }),
        prisma.quizSession.deleteMany({
          where: { textbookId },
        }),
        prisma.quizBookBorrow.deleteMany({
          where: { textbookId },
        }),
        prisma.quizTextbook.update({
          where: { id: textbookId },
          data: { isDeleted: true },
        }),
      ]);

      console.log(TAG + " deleteExam — 题库已一并删除");
      return { code: 200, data: { deletedTextbook: true }, message: "试卷及题库已删除（题库下无剩余试卷）" };
    }

    // 5. 剩余试卷数 > 0：更新题库计数
    await prisma.quizTextbook.update({
      where: { id: textbookId },
      data: {
        totalExams: remainingExamCount,
        totalQuestions: { decrement: questionCount },
      },
    });

    console.log(TAG + " deleteExam — 题库计数已更新");
    return { code: 200, data: { deletedTextbook: false }, message: "试卷已删除" };
  } catch (error) {
    console.error(TAG + " deleteExam — 删除失败: " + error.message);
    return { code: 500, data: null, message: "删除试卷失败: " + error.message };
  }
}

// ==================== 导入操作 ====================

/**
 * 事务性创建教材和试卷基础数据
 * @param {string} textbookName - 题库名称
 * @param {string} examName - 试卷名称
 * @param {string} userId - 用户ID
 * @param {string} [description] - 题库描述
 * @param {string} [generatingTaskId] - 关联的后台生成任务ID（有值时表示正在生成中）
 * @returns {Promise<{textbookId: bigint, examId: bigint}>}
 */
async function createTextbookAndExam(textbookName, examName, userId, description, generatingTaskId) {
  const bigUserId = BigInt(userId);

  // 查找用户是否已有同名题库（isDeleted=false），有则复用实现试卷合并
  const existingTextbook = await prisma.quizTextbook.findFirst({
    where: { name: textbookName, userId: bigUserId, isDeleted: false },
    select: { id: true },
    orderBy: { createTime: "asc" },
  });

  const result = await prisma.$transaction(async (tx) => {
    let textbookId;

    if (existingTextbook) {
      // 复用已有题库
      textbookId = existingTextbook.id;
      console.log(TAG + " createTextbookAndExam — 复用已有题库，textbookId: " + textbookId);
    } else {
      // 创建新题库
      const textbook = await tx.quizTextbook.create({
        data: {
          userId: bigUserId,
          name: textbookName,
          description: description || null,
          totalQuestions: 0,
          totalExams: 0,
          generatingTaskId: generatingTaskId || null,
        },
      });
      textbookId = textbook.id;
      console.log(TAG + " createTextbookAndExam — 创建新题库，textbookId: " + textbookId);
    }

    // 创建新试卷（始终新建）
    const exam = await tx.quizExam.create({
      data: { textbookId, name: examName, questionCount: 0 },
    });

    return { textbookId, examId: exam.id };
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
  // 统计该题库下实际的试卷总数
  const totalExams = await prisma.quizExam.count({ where: { textbookId } });

  await prisma.$transaction([
    prisma.quizExam.update({
      where: { id: examId },
      data: { questionCount: count },
    }),
    prisma.quizTextbook.update({
      where: { id: textbookId },
      data: {
        totalQuestions: { increment: count },
        totalExams,
      },
    }),
  ]);

  console.log(TAG + " updateQuestionCounts — 题目数: +" + count + ", 试卷数: " + totalExams);
}

/**
 * 清理空导入（没有任何成功入库的题目时，删除已创建的空教材和试卷）
 * @param {bigint} textbookId
 * @param {bigint} examId
 */
async function cleanupEmptyImport(textbookId, examId) {
  // 只删除空试卷（题库可能已有其他试卷，不再整库删除）
  await prisma.quizExam.delete({ where: { id: examId } });
  console.log(TAG + " cleanupEmptyImport — 已清理空试卷，examId: " + examId);
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
 * 查找进行中的顺序刷题会话
 * @param {string} userId - 用户ID
 * @param {string} textbookId - 题库ID
 * @returns {Promise<Object|null>} 会话对象或 null
 */
async function findActiveSequentialSession(userId, textbookId) {
  console.log(TAG + " findActiveSequentialSession — userId: " + userId + ", textbookId: " + textbookId);
  const bigUserId = BigInt(userId);
  const bigTextbookId = BigInt(textbookId);

  const session = await prisma.quizSession.findFirst({
    where: {
      userId: bigUserId,
      textbookId: bigTextbookId,
      mode: "SEQUENTIAL",
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

// ==================== 题库市场与共享操作 ====================

/**
 * 切换题库共享状态
 * @param {string} textbookId - 题库ID
 * @param {string} userId - 用户ID（仅题库所有者可切换）
 * @returns {Promise<{code: number, data: {isShared: boolean}|null, message: string}>}
 */
async function toggleShareStatus(textbookId, userId) {
  console.log(TAG + " toggleShareStatus — textbookId: " + textbookId + ", userId: " + userId);

  try {
    const bigId = BigInt(textbookId);
    const bigUserId = BigInt(userId);

    // 验证题库存在且属于该用户
    const textbook = await prisma.quizTextbook.findFirst({
      where: { id: bigId, userId: bigUserId, isDeleted: false },
      select: { id: true, isShared: true },
    });

    if (!textbook) {
      return { code: 404, data: null, message: "题库不存在或无权操作" };
    }

    // 切换共享状态
    const newShared = !textbook.isShared;
    await prisma.quizTextbook.update({
      where: { id: bigId },
      data: { isShared: newShared },
    });

    console.log(TAG + " toggleShareStatus — 切换成功，isShared: " + newShared);
    return { code: 200, data: { isShared: newShared }, message: "共享状态已更新" };
  } catch (error) {
    console.error(TAG + " toggleShareStatus — 失败: " + error.message);
    return { code: 500, data: null, message: "切换共享状态失败: " + error.message };
  }
}

/**
 * 题库市场列表（分页查询所有共享题库）
 * @param {string} userId - 当前用户ID（用于排除自己的题库 + 判断是否已借用）
 * @param {number} page - 页码（1-based）
 * @param {number} pageSize - 每页条数
 * @param {string} [keyword] - 搜索关键词
 * @returns {Promise<{code: number, data: {items, total, page, pageSize}, message: string}>}
 */
async function listMarketTextbooks(userId, page, pageSize, keyword) {
  console.log(TAG + " listMarketTextbooks — userId: " + userId + ", page: " + page + ", keyword: " + (keyword || "无"));

  try {
    const bigUserId = BigInt(userId);

    // 构建查询条件：isShared=true, 未删除（包含自己的共享题库，前端根据 isOwner 区分显示）
    const where = {
      isShared: true,
      isDeleted: false,
    };
    if (keyword && keyword.trim()) {
      where.name = { contains: keyword.trim() };
    }

    // 查询总数和分页数据
    const [total, items] = await Promise.all([
      prisma.quizTextbook.count({ where }),
      prisma.quizTextbook.findMany({
        where,
        orderBy: { updateTime: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { nickname: true } },
          _count: {
            select: { borrows: { where: { userId: bigUserId } } },
          },
        },
      }),
    ]);

    // 格式化返回数据
    const formattedItems = items.map((tb) => {
      const isOwner = tb.userId === bigUserId;
      return {
        id: tb.id,
        name: tb.name,
        description: tb.description,
        totalQuestions: tb.totalQuestions,
        totalExams: tb.totalExams,
        createTime: tb.createTime,
        updateTime: tb.updateTime,
        isShared: tb.isShared,
        creatorNickname: tb.user?.nickname || null,
        isBorrowed: tb._count.borrows > 0,
        isOwner, // 是否是当前用户自己的题库（前端据此显示"自己的"而非借用按钮）
      };
    });

    console.log(TAG + " listMarketTextbooks — 查询成功，共 " + total + " 条，当前页 " + formattedItems.length + " 条");

    return {
      code: 200,
      data: { items: formattedItems, total, page, pageSize },
      message: "查询成功",
    };
  } catch (error) {
    console.error(TAG + " listMarketTextbooks — 查询失败: " + error.message);
    return { code: 500, data: null, message: "查询题库市场失败: " + error.message };
  }
}

/**
 * 借用题库（创建借用记录）
 * @param {string} userId - 借用者用户ID
 * @param {string} textbookId - 要借用的题库ID
 * @returns {Promise<{code: number, data: null, message: string}>}
 */
async function borrowTextbook(userId, textbookId) {
  console.log(TAG + " borrowTextbook — userId: " + userId + ", textbookId: " + textbookId);

  try {
    const bigUserId = BigInt(userId);
    const bigTextbookId = BigInt(textbookId);

    // 验证题库存在且已共享
    const textbook = await prisma.quizTextbook.findFirst({
      where: { id: bigTextbookId, isShared: true, isDeleted: false },
      select: { id: true, userId: true },
    });

    if (!textbook) {
      return { code: 404, data: null, message: "题库不存在或未共享" };
    }

    // 不能借用自己创建的题库
    if (textbook.userId === bigUserId) {
      return { code: 400, data: null, message: "不能借用自己创建的题库" };
    }

    // 检查是否已借用（防重复）
    const existing = await prisma.quizBookBorrow.findUnique({
      where: {
        userId_textbookId: {
          userId: bigUserId,
          textbookId: bigTextbookId,
        },
      },
    });

    if (existing) {
      return { code: 400, data: null, message: "已借用过该题库，无需重复借用" };
    }

    // 创建借用记录
    await prisma.quizBookBorrow.create({
      data: {
        userId: bigUserId,
        textbookId: bigTextbookId,
      },
    });

    console.log(TAG + " borrowTextbook — 借用成功");
    return { code: 200, data: null, message: "题库借用成功" };
  } catch (error) {
    console.error(TAG + " borrowTextbook — 失败: " + error.message);
    return { code: 500, data: null, message: "借用题库失败: " + error.message };
  }
}

/**
 * 取消借用题库（删除借用记录，保留用户历史刷题数据）
 * @param {string} userId - 用户ID
 * @param {string} textbookId - 题库ID
 * @returns {Promise<{code: number, data: null, message: string}>}
 */
async function unborrowTextbook(userId, textbookId) {
  console.log(TAG + " unborrowTextbook — userId: " + userId + ", textbookId: " + textbookId);

  try {
    const bigUserId = BigInt(userId);
    const bigTextbookId = BigInt(textbookId);

    // 检查是否存在借用记录
    const existing = await prisma.quizBookBorrow.findUnique({
      where: {
        userId_textbookId: {
          userId: bigUserId,
          textbookId: bigTextbookId,
        },
      },
    });

    if (!existing) {
      return { code: 404, data: null, message: "未借用该题库" };
    }

    // 删除借用记录（不删除用户已有的刷题记录和错题数据）
    await prisma.quizBookBorrow.delete({
      where: {
        userId_textbookId: {
          userId: bigUserId,
          textbookId: bigTextbookId,
        },
      },
    });

    console.log(TAG + " unborrowTextbook — 取消借用成功");
    return { code: 200, data: null, message: "已取消借用" };
  } catch (error) {
    console.error(TAG + " unborrowTextbook — 失败: " + error.message);
    return { code: 500, data: null, message: "取消借用失败: " + error.message };
  }
}

/**
 * 获取用户已借用的题库ID列表
 * @param {string} userId - 用户ID
 * @returns {Promise<string[]>} 已借用的 textbookId 数组（字符串形式）
 */
async function getUserBorrowedTextbookIds(userId) {
  const bigUserId = BigInt(userId);

  const records = await prisma.quizBookBorrow.findMany({
    where: { userId: bigUserId },
    select: { textbookId: true },
  });

  return records.map((r) => r.textbookId.toString());
}

// ==================== 按试卷查询题目 ====================

/**
 * 按试卷ID获取所有题目ID列表（按 sortOrder 升序排列，用于顺序刷题）
 * @param {string} examId - 试卷ID
 * @returns {Promise<string[]>} 题目ID字符串数组
 */
async function getAllQuestionIdsByExamId(examId) {
  console.log(TAG + " getAllQuestionIdsByExamId — examId: " + examId);

  const bigExamId = BigInt(examId);
  const rows = await prisma.quizQuestion.findMany({
    where: { examId: bigExamId },
    select: { id: true },
    orderBy: { sortOrder: "asc" },
  });

  const ids = rows.map((r) => r.id.toString());
  console.log(TAG + " getAllQuestionIdsByExamId — 共 " + ids.length + " 题");
  return ids;
}

/**
 * 按试卷ID + 题型随机抽取题目（每种题型最多5题，用于随机刷题）
 * @param {string} examId - 试卷ID
 * @returns {Promise<string[]>} 随机抽取的题目ID字符串数组
 */
async function sampleQuestionIdsByExamId(examId) {
  console.log(TAG + " sampleQuestionIdsByExamId — examId: " + examId);

  const RANDOM_QUESTION_TYPES = ["SINGLE", "MULTIPLE", "JUDGE", "FILL", "ESSAY"];
  const RANDOM_PER_TYPE = 5;
  const bigExamId = BigInt(examId);
  const sampledIds = [];

  for (const questionType of RANDOM_QUESTION_TYPES) {
    const rows = await prisma.quizQuestion.findMany({
      where: { examId: bigExamId, type: questionType },
      select: { id: true },
    });

    // Fisher-Yates 洗牌
    const shuffled = [...rows].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, RANDOM_PER_TYPE);
    for (const row of selected) {
      sampledIds.push(row.id.toString());
    }
  }

  console.log(TAG + " sampleQuestionIdsByExamId — 抽取完成，共 " + sampledIds.length + " 题");
  return sampledIds;
}

/**
 * 查找进行中的基于试卷的刷题会话（按模式查询）
 * @param {string} userId - 用户ID
 * @param {string} examId - 试卷ID
 * @param {string} mode - 刷题模式（"SEQUENTIAL" / "RANDOM"）
 * @returns {Promise<Object|null>} 进行中的会话 或 null
 */
async function findActiveExamSession(userId, examId, mode) {
  console.log(TAG + " findActiveExamSession — userId: " + userId + ", examId: " + examId + ", mode: " + mode);

  const bigUserId = BigInt(userId);
  const bigExamId = BigInt(examId);

  const session = await prisma.quizSession.findFirst({
    where: {
      userId: bigUserId,
      examId: bigExamId,
      mode: mode,
      status: "IN_PROGRESS",
    },
    orderBy: { updateTime: "desc" },
  });

  if (session) {
    console.log(TAG + " findActiveExamSession — 命中进行中会话: " + session.id);
    return session;
  }

  return null;
}

module.exports = {
  // 题库
  listTextbooks,
  getTextbookDetail,
  deleteTextbook,
  deleteExam,
  // 导入
  createTextbookAndExam,
  batchCreateQuestions,
  updateQuestionCounts,
  cleanupEmptyImport,
  // 会话
  findActiveRandomSession,
  findActiveSequentialSession,
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
  // 题库市场与共享
  toggleShareStatus,
  listMarketTextbooks,
  borrowTextbook,
  unborrowTextbook,
  getUserBorrowedTextbookIds,
  // 按试卷查询
  getAllQuestionIdsByExamId,
  sampleQuestionIdsByExamId,
  findActiveExamSession,
};
