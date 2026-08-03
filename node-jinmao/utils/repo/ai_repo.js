// ==================== AI 助教对话 Repository 模块 ====================
// 职责：封装 AiConversation / AiMessage 表的数据库操作，提供统一的数据访问接口
// 所有查询默认过滤 isDeleted: false，确保软删除记录不被检索
// 使用 Prisma Client 进行类型安全的数据库操作

const prisma = require("../prisma");

// 日志前缀
const TAG = "[ai_repo]";

/**
 * 创建 AI 助教对话（懒创建：用户发送首条消息时才调用）
 * @param {Object} data - 对话数据
 * @param {string} data.userId - 用户 ID
 * @param {string} data.courseId - 课程 ID
 * @param {string} data.chapterId - 章节 ID
 * @param {string} data.model - 对话模型（flash / pro）
 * @param {string} data.title - 对话标题（首条问题截断 30 字）
 * @param {number} data.pageNumber - 上下文素材快照页码
 * @returns {Promise<{ code: number, conversation?: Object, message?: string }>}
 */
async function createConversation(data) {
  console.log(TAG + "[createConversation] 创建对话: 用户 " + data.userId + "，课程 " + data.courseId + "，章节 " + data.chapterId + "，模型 " + data.model);

  try {
    const conversation = await prisma.aiConversation.create({
      data: {
        userId: BigInt(data.userId),
        courseId: BigInt(data.courseId),
        chapterId: BigInt(data.chapterId),
        model: data.model || "flash",
        title: data.title || "",
        pageNumber: data.pageNumber || 1,
      },
    });

    console.log(TAG + "[createConversation] 对话创建成功，ID: " + conversation.id);
    return { code: 200, conversation: conversation };
  } catch (error) {
    console.error(TAG + "[createConversation] 数据库创建异常: " + error.message);
    return { code: 500, message: "创建对话异常: " + error.message };
  }
}

/**
 * 查询指定用户-课程的对话列表（可按章节过滤），按更新时间倒序
 * @param {string} userId - 用户 ID
 * @param {string} courseId - 课程 ID
 * @param {string} [chapterId] - 可选，章节 ID 过滤
 * @returns {Promise<{ code: number, conversations?: Array, message?: string }>}
 */
async function listConversations(userId, courseId, chapterId) {
  console.log(TAG + "[listConversations] 查询对话列表: 用户 " + userId + "，课程 " + courseId + (chapterId ? "，章节 " + chapterId : ""));

  try {
    const where = {
      userId: BigInt(userId),
      courseId: BigInt(courseId),
      isDeleted: false,
    };
    if (chapterId) {
      where.chapterId = BigInt(chapterId);
    }

    const conversations = await prisma.aiConversation.findMany({
      where: where,
      orderBy: { updateTime: "desc" },
      include: {
        chapter: { select: { id: true, name: true } },
        _count: { select: { messages: { where: { isDeleted: false } } } },
      },
    });

    return { code: 200, conversations: conversations };
  } catch (error) {
    console.error(TAG + "[listConversations] 数据库查询异常: " + error.message);
    return { code: 500, message: "数据库查询异常: " + error.message };
  }
}

/**
 * 查询指定对话详情（含完整消息历史 + 章节信息），校验用户归属
 * @param {string} userId - 用户 ID
 * @param {string} conversationId - 对话 ID
 * @returns {Promise<{ code: number, conversation?: Object, message?: string }>}
 */
async function getConversation(userId, conversationId) {
  console.log(TAG + "[getConversation] 查询对话: " + conversationId + "，用户 " + userId);

  try {
    const conversation = await prisma.aiConversation.findFirst({
      where: {
        id: BigInt(conversationId),
        userId: BigInt(userId),
        isDeleted: false,
      },
      include: {
        chapter: { select: { id: true, name: true } },
        messages: {
          where: { isDeleted: false },
          orderBy: [{ createTime: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!conversation) {
      return { code: 404, message: "对话不存在。" };
    }

    return { code: 200, conversation: conversation };
  } catch (error) {
    console.error(TAG + "[getConversation] 数据库查询异常: " + error.message);
    return { code: 500, message: "数据库查询异常: " + error.message };
  }
}

/**
 * 查询指定章节最近一次对话（自动恢复用），按更新时间倒序取第一条
 * @param {string} userId - 用户 ID
 * @param {string} courseId - 课程 ID
 * @param {string} chapterId - 章节 ID
 * @returns {Promise<{ code: number, conversation?: Object|null, message?: string }>}
 */
async function getLatestConversationForChapter(userId, courseId, chapterId) {
  console.log(TAG + "[getLatestConversationForChapter] 查询章节最近对话: 章节 " + chapterId + "，用户 " + userId);

  try {
    const conversation = await prisma.aiConversation.findFirst({
      where: {
        userId: BigInt(userId),
        courseId: BigInt(courseId),
        chapterId: BigInt(chapterId),
        isDeleted: false,
      },
      orderBy: { updateTime: "desc" },
    });

    return { code: 200, conversation: conversation || null };
  } catch (error) {
    console.error(TAG + "[getLatestConversationForChapter] 数据库查询异常: " + error.message);
    return { code: 500, message: "数据库查询异常: " + error.message };
  }
}

/**
 * 添加一条消息（user 或 assistant）
 * @param {string} conversationId - 对话 ID
 * @param {string} role - user / assistant
 * @param {string} content - 消息内容
 * @param {Object} [usage] - 用量（assistant 消息记录）：{ promptTokens, completionTokens, totalTokens }
 * @param {number} [cost] - 本次费用（元，assistant 消息记录）
 * @param {string} [thinking] - 思考过程（assistant 消息记录）
 * @param {string[]} [suggestions] - 推荐追问（assistant 消息记录）
 * @returns {Promise<{ code: number, message?: Object, error?: string }>}
 */
async function addMessage(conversationId, role, content, usage, cost, thinking, suggestions) {
  console.log(TAG + "[addMessage] 添加消息: 对话 " + conversationId + "，角色 " + role + "，长度 " + (content ? content.length : 0));

  try {
    const message = await prisma.aiMessage.create({
      data: {
        conversationId: BigInt(conversationId),
        role: role,
        content: content,
        promptTokens: usage?.promptTokens ?? null,
        completionTokens: usage?.completionTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        cost: cost !== undefined && cost !== null ? cost : null,
        thinking: thinking || null,
        suggestions: suggestions && suggestions.length > 0 ? suggestions : null,
      },
    });

    return { code: 200, message: message };
  } catch (error) {
    console.error(TAG + "[addMessage] 数据库写入异常: " + error.message);
    return { code: 500, error: "数据库写入异常: " + error.message };
  }
}

/**
 * 更新消息内容（当前页素材 context 消息翻页后原地更新）
 * @param {string} messageId - 消息 ID
 * @param {string} content - 新内容
 * @returns {Promise<{ code: number, message?: string }>}
 */
async function updateMessageContent(messageId, content) {
  console.log(TAG + "[updateMessageContent] 更新消息 " + messageId + " 内容，长度 " + (content ? content.length : 0));

  try {
    await prisma.aiMessage.update({
      where: { id: BigInt(messageId) },
      data: { content: content },
    });
    return { code: 200 };
  } catch (error) {
    console.error(TAG + "[updateMessageContent] 数据库更新异常: " + error.message);
    return { code: 500, message: "数据库更新异常: " + error.message };
  }
}

/**
 * 更新对话使用的模型（用户切换模型后生效，同时刷新 updateTime）
 * @param {string} conversationId - 对话 ID
 * @param {string} model - flash / pro
 * @returns {Promise<{ code: number, message?: string }>}
 */
async function updateConversationModel(conversationId, model) {
  console.log(TAG + "[updateConversationModel] 更新对话 " + conversationId + " 模型为 " + model);

  try {
    // 用 updateMany 过滤软删除（update 的 where 仅接受唯一字段，isDeleted 会导致调用报错）
    const result = await prisma.aiConversation.updateMany({
      where: { id: BigInt(conversationId), isDeleted: false },
      data: { model: model },
    });
    if (result.count === 0) {
      return { code: 404, message: "对话不存在。" };
    }
    return { code: 200 };
  } catch (error) {
    console.error(TAG + "[updateConversationModel] 数据库更新异常: " + error.message);
    return { code: 500, message: "数据库更新异常: " + error.message };
  }
}

/**
 * 更新 assistant 消息的推荐追问（流结束后写入）
 * @param {string} messageId - 消息 ID
 * @param {string[]} suggestions - 推荐追问数组
 * @returns {Promise<{ code: number, message?: string }>}
 */
async function updateMessageSuggestions(messageId, suggestions) {
  console.log(TAG + "[updateMessageSuggestions] 更新消息 " + messageId + " 的推荐追问");

  try {
    await prisma.aiMessage.update({
      where: { id: BigInt(messageId) },
      data: { suggestions: suggestions && suggestions.length > 0 ? suggestions : null },
    });
    return { code: 200 };
  } catch (error) {
    console.error(TAG + "[updateMessageSuggestions] 数据库更新异常: " + error.message);
    return { code: 500, message: "数据库更新异常: " + error.message };
  }
}

module.exports = {
  createConversation,
  listConversations,
  getConversation,
  getLatestConversationForChapter,
  addMessage,
  updateMessageContent,
  updateConversationModel,
  updateMessageSuggestions,
};
