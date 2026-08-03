// ==================== AI 助教问答路由模块 ====================
// 职责：课程学习页 AI 助教对话的 HTTP 接口
// 端点：
//   GET  /api/v1/courses/:courseId/ai/conversations            — 对话列表（可按章节过滤）
//   GET  /api/v1/courses/:courseId/ai/conversations/:id        — 对话详情（恢复历史）
//   POST /api/v1/courses/:courseId/ai/chat/stream              — SSE 流式问答
// 鉴权：需 Bearer Token（authenticateToken 中间件）

const express = require("express");
const router = express.Router();

const { authenticateToken } = require("../../middleware/auth");
const aiRepo = require("../../utils/repo/ai_repo");
const courseAi = require("../../service/course_ai");

// 日志前缀
const TAG = "[API_course_chat]";

/** 校验纯数字 ID */
function isValidId(id) {
  return typeof id === "string" && /^\d+$/.test(id);
}

/** 序列化对话（BigInt → String） */
function serializeConversation(c) {
  return {
    id: String(c.id),
    courseId: String(c.courseId),
    chapterId: String(c.chapterId),
    chapterName: c.chapter?.name || "",
    title: c.title || "",
    model: c.model || "flash",
    messageCount: c._count?.messages ?? (c.messages?.length ?? 0),
    updateTime: c.updateTime,
    createTime: c.createTime,
  };
}

/** 序列化消息（BigInt/Decimal → String/Number） */
function serializeMessage(m) {
  return {
    id: String(m.id),
    role: m.role,
    content: m.content,
    promptTokens: m.promptTokens ?? null,
    completionTokens: m.completionTokens ?? null,
    totalTokens: m.totalTokens ?? null,
    cost: m.cost !== null && m.cost !== undefined ? parseFloat(String(m.cost)) : null,
    thinking: m.thinking || null,
    suggestions: m.suggestions || null,
    createTime: m.createTime,
  };
}

/**
 * GET /courses/:courseId/ai/conversations — 对话列表
 */
router.get("/courses/:courseId/ai/conversations", authenticateToken, async (req, res) => {
  const { courseId } = req.params;
  const chapterId = req.query.chapterId || null;
  console.log(TAG + " [GET] 对话列表请求，courseId: " + courseId + (chapterId ? "，chapterId: " + chapterId : "") + "，userId: " + req.userId);

  try {
    if (!isValidId(courseId)) {
      return res.status(400).json({ code: 400, message: "课程 ID 格式无效，必须为纯数字。", data: null });
    }
    if (chapterId && !isValidId(chapterId)) {
      return res.status(400).json({ code: 400, message: "章节 ID 格式无效，必须为纯数字。", data: null });
    }

    const courseCheck = await courseAi.assertCourseOwnership(courseId, req.userId);
    if (courseCheck.code !== 200) {
      return res.status(courseCheck.code).json({ code: courseCheck.code, message: courseCheck.message, data: null });
    }

    if (chapterId) {
      const chapterCheck = await courseAi.assertChapterBelongsToCourse(courseId, chapterId);
      if (chapterCheck.code !== 200) {
        return res.status(chapterCheck.code).json({ code: chapterCheck.code, message: chapterCheck.message, data: null });
      }
    }

    const result = await aiRepo.listConversations(req.userId, courseId, chapterId || undefined);
    if (result.code !== 200) {
      return res.status(500).json({ code: 500, message: result.message, data: null });
    }

    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: {
        models: courseAi.getAvailableModels(),
        conversations: result.conversations.map(serializeConversation),
      },
    });
  } catch (error) {
    console.error(TAG + " [GET] 对话列表异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * GET /courses/:courseId/ai/conversations/:conversationId — 对话详情（恢复历史）
 */
router.get("/courses/:courseId/ai/conversations/:conversationId", authenticateToken, async (req, res) => {
  const { courseId, conversationId } = req.params;
  console.log(TAG + " [GET] 对话详情请求，courseId: " + courseId + "，conversationId: " + conversationId + "，userId: " + req.userId);

  try {
    if (!isValidId(courseId) || !isValidId(conversationId)) {
      return res.status(400).json({ code: 400, message: "课程 ID 或对话 ID 格式无效。", data: null });
    }

    const courseCheck = await courseAi.assertCourseOwnership(courseId, req.userId);
    if (courseCheck.code !== 200) {
      return res.status(courseCheck.code).json({ code: courseCheck.code, message: courseCheck.message, data: null });
    }

    const result = await aiRepo.getConversation(req.userId, conversationId);
    if (result.code === 404) {
      return res.status(404).json({ code: 404, message: "对话不存在。", data: null });
    }
    if (result.code !== 200) {
      return res.status(500).json({ code: 500, message: result.message, data: null });
    }

    const conversation = result.conversation;
    // 校验对话属于该课程
    if (String(conversation.courseId) !== String(courseId)) {
      return res.status(400).json({ code: 400, message: "该对话不属于指定课程。", data: null });
    }

    const messages = (conversation.messages || []).map(serializeMessage);
    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: {
        models: courseAi.getAvailableModels(),
        conversation: {
          id: String(conversation.id),
          chapterId: String(conversation.chapterId),
          chapterName: conversation.chapter?.name || "",
          title: conversation.title || "",
          model: conversation.model || "flash",
          updateTime: conversation.updateTime,
          messages: messages,
          cumulative: courseAi.computeCumulative(conversation.messages || []),
        },
      },
    });
  } catch (error) {
    console.error(TAG + " [GET] 对话详情异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * POST /courses/:courseId/ai/chat/stream — SSE 流式问答
 */
router.post("/courses/:courseId/ai/chat/stream", authenticateToken, async (req, res) => {
  const { courseId } = req.params;
  const { chapterId, conversationId, question, pageNumber, model } = req.body || {};
  console.log(TAG + " [POST] 流式问答请求，courseId: " + courseId + "，chapterId: " + chapterId
    + (conversationId ? "，conversationId: " + conversationId : "（新对话）")
    + "，pageNumber: " + pageNumber + "，model: " + (model || "flash") + "，userId: " + req.userId);

  try {
    if (!isValidId(courseId)) {
      return res.status(400).json({ code: 400, message: "课程 ID 格式无效，必须为纯数字。", data: null });
    }

    // 流式主流程：校验失败（400/401/403/404/402）时在写 SSE 头之前抛出 ChatError
    await courseAi.streamChat(res, req.userId, {
      courseId: String(courseId),
      chapterId: chapterId ? String(chapterId) : "",
      conversationId: conversationId ? String(conversationId) : null,
      question: question,
      pageNumber: pageNumber,
      model: model || "flash",
    });
  } catch (error) {
    // streamChat 已写 SSE 头时，内部异常由它自行处理（此处为防御性兜底）
    if (res.headersSent) {
      try {
        res.write("event: error\ndata: " + JSON.stringify({ message: error.message || "服务器内部错误" }) + "\n\n");
        res.write("event: end\ndata: {}\n\n");
        res.end();
      } catch (_) { /* 连接已关闭，忽略 */ }
      return;
    }

    if (error instanceof courseAi.ChatError) {
      console.log(TAG + " [POST] 业务校验失败: " + error.status + " " + error.message);
      return res.status(error.status).json({ code: error.status, message: error.message, data: null });
    }

    console.error(TAG + " [POST] 流式问答异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

module.exports = router;
