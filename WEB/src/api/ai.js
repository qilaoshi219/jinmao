// ==================== AI 助教问答 API 封装 ====================
// 职责：封装课程学习页 AI 助教对话的 HTTP 请求
// 包含：对话列表、对话详情、SSE 流式问答

import apiClient from "./client";

// 日志前缀
const TAG = "[api_ai]";

/**
 * 获取课程下的 AI 助教对话列表
 * GET /api/v1/courses/:courseId/ai/conversations
 * @param {string|number} courseId - 课程 ID
 * @param {string|number} [chapterId] - 可选，章节 ID 过滤
 * @returns {Promise} { code, message, data: { models, conversations[] } }
 */
export async function getAiConversations(courseId, chapterId) {
  const params = {};
  if (chapterId) params.chapterId = chapterId;

  const response = await apiClient.get("/courses/" + courseId + "/ai/conversations", { params });
  return response.data;
}

/**
 * 获取 AI 助教对话详情（恢复历史）
 * GET /api/v1/courses/:courseId/ai/conversations/:conversationId
 * @param {string|number} courseId - 课程 ID
 * @param {string|number} conversationId - 对话 ID
 * @returns {Promise} { code, message, data: { models, conversation: { messages[], cumulative, model } } }
 */
export async function getAiConversation(courseId, conversationId) {
  const response = await apiClient.get("/courses/" + courseId + "/ai/conversations/" + conversationId);
  return response.data;
}

/**
 * SSE 流式问答
 * POST /api/v1/courses/:courseId/ai/chat/stream
 * 使用 fetch 读取 text/event-stream，逐事件回调
 *
 * @param {string|number} courseId - 课程 ID
 * @param {Object} payload - { chapterId, conversationId?, question, pageNumber, model }
 * @param {Object} handlers - 事件回调
 * @param {(data: Object) => void} [handlers.onMeta] - meta 事件（conversationId/models）
 * @param {(data: Object) => void} [handlers.onThinkDelta] - think_delta 事件（思考内容 { text }）
 * @param {(data: Object) => void} [handlers.onDelta] - delta 事件（{ text }）
 * @param {(data: Object) => void} [handlers.onDone] - done 事件（usage/cost/cumulative）
 * @param {(data: Object) => void} [handlers.onSuggestions] - suggestions 事件（{ suggestions }）
 * @param {(data: Object) => void} [handlers.onError] - error 事件（{ message }）
 * @param {() => void} [handlers.onEnd] - end 事件
 * @param {(error: Error) => void} [handlers.onNetworkError] - 网络/HTTP 错误
 */
export async function streamAiChat(courseId, payload, handlers = {}) {
  const token = localStorage.getItem("token");

  try {
    const response = await fetch("/api/v1/courses/" + courseId + "/ai/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: token ? "Bearer " + token : "",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // 非流式错误响应（400/401/402/403/404/500）
      let message = "请求失败（" + response.status + "）";
      try {
        const data = await response.json();
        message = data?.message || message;
      } catch (_) { /* 忽略解析失败 */ }
      const err = new Error(message);
      err.status = response.status;
      if (handlers.onNetworkError) handlers.onNetworkError(err);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      if (handlers.onNetworkError) handlers.onNetworkError(new Error("无法读取响应流"));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let ended = false; // 是否已收到 end 事件（流异常关闭时兜底触发 onEnd，避免卡死）

    // 按空行切分 SSE 事件块
    function parseBlock(block) {
      let eventName = "message";
      const dataLines = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) {
          eventName = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          dataLines.push(line.slice(6));
        }
      }
      if (dataLines.length === 0) return;

      let data = null;
      try {
        data = JSON.parse(dataLines.join("\n"));
      } catch (_) {
        data = { raw: dataLines.join("\n") };
      }

      switch (eventName) {
        case "meta":
          handlers.onMeta && handlers.onMeta(data);
          break;
        case "delta":
          handlers.onDelta && handlers.onDelta(data);
          break;
        case "think_delta":
          handlers.onThinkDelta && handlers.onThinkDelta(data);
          break;
        case "done":
          handlers.onDone && handlers.onDone(data);
          break;
        case "suggestions":
          handlers.onSuggestions && handlers.onSuggestions(data);
          break;
        case "error":
          handlers.onError && handlers.onError(data);
          break;
        case "end":
          ended = true;
          handlers.onEnd && handlers.onEnd();
          break;
        default:
          break;
      }
    }

    function pump() {
      reader.read().then(({ value, done }) => {
        if (done) {
          // 清理缓冲区尾部事件
          if (buffer.trim()) parseBlock(buffer.trim());
          // 流关闭但未收到 end 事件（后端异常/断连）：兜底结束，避免 aiStreaming 卡死
          if (!ended && handlers.onEnd) handlers.onEnd();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          if (block.trim()) parseBlock(block.trim());
        }
        pump();
      }).catch((err) => {
        console.error(TAG + " SSE 读取失败:", err);
        if (handlers.onNetworkError) handlers.onNetworkError(err);
      });
    }

    pump();
  } catch (error) {
    console.error(TAG + " 流式请求异常:", error);
    if (handlers.onNetworkError) handlers.onNetworkError(error);
  }
}
