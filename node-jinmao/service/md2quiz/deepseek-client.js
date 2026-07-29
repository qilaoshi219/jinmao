// ==================== DeepSeek 流式客户端 ====================
// 职责：调用 DeepSeek API 流式生成 JSON 题目，支持 per-delta 回调
// 与 llm_client.js 独立，因为需要 per-delta 回调来控制大量流式输出的进度更新
// 移植自 test/金毛刷题/backend/src/modules/markdown-json-test/deepseek-client.ts

const https = require("https");
const http = require("http");
const { deepseek: config } = require("../../config");

const TAG = "[md2quiz_deepseek]";

/**
 * 截取文本预览（用于日志）
 * @param {string} text
 * @param {number} [maxLength=300]
 * @returns {string}
 */
function getResponsePreview(text, maxLength = 300) {
  return text.slice(0, maxLength);
}

/**
 * 发起 HTTP/HTTPS 请求
 * @param {string} urlStr        - 完整请求 URL
 * @param {string} method        - HTTP 方法
 * @param {object} headers       - 请求头
 * @param {string|null} body     - 请求体
 * @returns {Promise<{success: boolean, status?: number, body?: string, error?: string}>}
 */
function httpRequest(urlStr, method, headers, body) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(urlStr);
    const isHttps = parsedUrl.protocol === "https:";
    const transport = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: headers,
    };

    const req = transport.request(options, (res) => {
      let responseData = "";

      // 如果是流式响应，直接 resolve 原始 response
      if (headers.Accept === "text/event-stream" || method === "POST") {
        // 对于流式响应，我们直接返回 response 对象供后续处理
        // 注意：这里返回 responseData 而不是 stream，由调用方处理
        res.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        res.on("end", () => {
          resolve({
            success: true,
            status: res.statusCode,
            body: responseData,
          });
        });
      } else {
        res.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        res.on("end", () => {
          resolve({
            success: true,
            status: res.statusCode,
            body: responseData,
          });
        });
      }
    });

    req.on("error", (err) => {
      let errMsg = TAG + " HTTP 请求失败: " + err.message;
      console.error(errMsg);
      resolve({ success: false, error: errMsg });
    });

    req.setTimeout(600000, () => {
      req.destroy();
      resolve({
        success: false,
        error: TAG + " HTTP 请求超时（10分钟）。",
      });
    });

    if (body !== null && body !== undefined) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * 使用 fetch API 进行流式 DeepSeek 调用
 * 与旧项目一样使用 fetch + ReadableStream reader 处理 SSE 流
 *
 * @param {import("./types").DeepseekMessage[]} messages         - 消息数组
 * @param {Object} [options={}]                                  - 选项
 * @param {(deltaText: string) => void} [options.onDelta]        - per-delta 回调
 * @returns {Promise<{model: string, content: string, httpStatus: number, usage?: object}>}
 */
async function requestDeepseekJsonCompletionStream(messages, options = {}) {
  const apiConfig = config.DEEPSEEK_API_SMALL; // 使用 flash 模型（速度快、成本低）
  const apiKey = apiConfig.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("未配置 DEEPSEEK_API_KEY，无法调用 DeepSeek 模型。");
  }

  if (/[^\x20-\x7E]/.test(apiKey)) {
    throw new Error(
      "DEEPSEEK_API_KEY 包含非 ASCII 字符，可能导致请求报错。请检查 .env 文件。"
    );
  }

  const requestUrl =
    apiConfig.DEEPSEEK_API_BASE.replace(/\/$/, "") + "/chat/completions";

  console.log(TAG + " 开始调用 DeepSeek 流式接口", {
    model: apiConfig.DEEPSEEK_API_MODEL,
    messageCount: messages.length,
  });

  const requestStartedAt = Date.now();

  let response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: apiConfig.DEEPSEEK_API_MODEL,
        messages,
        stream: true,
        temperature: 0.6,
        response_format: {
          type: "json_object",
        },
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知网络错误";
    console.error(TAG + " DeepSeek 请求发送失败", {
      requestUrl,
      durationMs: Date.now() - requestStartedAt,
      message,
    });
    throw new Error(`DeepSeek 请求发送失败：${message}`);
  }

  if (!response.ok) {
    const responseText = await response.text();
    const responsePreview = getResponsePreview(responseText);

    let responseJson;
    try {
      responseJson = responseText
        ? JSON.parse(responseText)
        : {};
    } catch (_) {
      console.error(TAG + " DeepSeek 响应 JSON 解析失败", {
        status: response.status,
        responsePreview,
      });
      throw new Error(
        `DeepSeek 响应不是合法 JSON，HTTP 状态码 ${response.status}`
      );
    }

    console.error(TAG + " DeepSeek 接口返回错误", {
      status: response.status,
      responseJson,
    });

    throw new Error(
      responseJson.error?.message ||
        `DeepSeek 接口调用失败，HTTP 状态码 ${response.status}`
    );
  }

  if (!response.body) {
    throw new Error("DeepSeek 未返回可读取的流式响应体。");
  }

  console.log(TAG + " DeepSeek 流式响应已建立", {
    status: response.status,
    durationMs: Date.now() - requestStartedAt,
  });

  // 使用 ReadableStream reader 逐块读取 SSE 事件（与旧项目实现一致）
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bufferedText = "";
  let aggregatedContent = "";
  let latestUsage = null;
  let latestModel = apiConfig.DEEPSEEK_API_MODEL;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    bufferedText += decoder.decode(value, { stream: true });

    // 按 "\n\n" 分割 SSE 事件块
    while (true) {
      const eventSeparatorIndex = bufferedText.indexOf("\n\n");
      if (eventSeparatorIndex === -1) break;

      const rawEventBlock = bufferedText.slice(0, eventSeparatorIndex);
      bufferedText = bufferedText.slice(eventSeparatorIndex + 2);

      const eventLines = rawEventBlock
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of eventLines) {
        if (!line.startsWith("data:")) continue;

        const rawData = line.slice("data:".length).trim();
        if (!rawData || rawData === "[DONE]") continue;

        let parsedPayload;
        try {
          parsedPayload = JSON.parse(rawData);
        } catch (_) {
          console.warn(TAG + " 流式分片 JSON 解析失败（非致命）", {
            rawDataPreview: getResponsePreview(rawData, 80),
          });
          continue;
        }

        if (parsedPayload.error?.message) {
          throw new Error(parsedPayload.error.message);
        }

        latestModel = parsedPayload.model || latestModel;
        latestUsage = parsedPayload.usage || latestUsage;

        const deltaContent = parsedPayload.choices?.[0]?.delta?.content;
        if (!deltaContent || typeof deltaContent !== "string") continue;

        aggregatedContent += deltaContent;
        // 触发 per-delta 回调（用于进度更新）
        options.onDelta?.(deltaContent);
      }
    }
  }

  // 处理尾部残余数据
  if (bufferedText.trim()) {
    const trailingLines = bufferedText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    for (const line of trailingLines) {
      if (!line.startsWith("data:")) continue;
      const rawData = line.slice("data:".length).trim();
      if (!rawData || rawData === "[DONE]") continue;

      try {
        const parsedPayload = JSON.parse(rawData);
        const deltaContent = parsedPayload.choices?.[0]?.delta?.content;
        if (deltaContent && typeof deltaContent === "string") {
          aggregatedContent += deltaContent;
          options.onDelta?.(deltaContent);
        }
        latestModel = parsedPayload.model || latestModel;
        latestUsage = parsedPayload.usage || latestUsage;
      } catch (_) {
        // 忽略尾部残余数据的解析错误
      }
    }
  }

  if (!aggregatedContent) {
    console.error(TAG + " DeepSeek 流式接口未返回有效内容");
    throw new Error("DeepSeek 接口未返回有效内容。");
  }

  console.log(TAG + " DeepSeek 流式调用成功", {
    model: latestModel,
    totalTokens: latestUsage?.total_tokens,
    contentLength: aggregatedContent.length,
    durationSec: ((Date.now() - requestStartedAt) / 1000).toFixed(1),
  });

  return {
    model: latestModel,
    content: aggregatedContent,
    httpStatus: response.status,
    usage: {
      promptTokens: latestUsage?.prompt_tokens || null,
      completionTokens: latestUsage?.completion_tokens || null,
      totalTokens: latestUsage?.total_tokens || null,
    },
  };
}

module.exports = { requestDeepseekJsonCompletionStream };
