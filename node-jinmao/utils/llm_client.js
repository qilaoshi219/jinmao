// ==================== 统一 LLM 客户端模块 ====================
// 职责：统一管理 OpenAI 客户端初始化、调用 DeepSeek API、自动计费
// 消除 5 个 utils 文件中重复的 getOpenAI() 代码
// 自动提取 completion.usage 并调用 billing.recordTokenUsage() 计费
//
// 使用方式：
//   const llmClient = require("../utils/llm_client");
//   const result = await llmClient.chat(userId, callTag, options);
//
// options 格式：
//   {
//     modelSize: "small" | "big",          // 模型大小（决定用 flash 还是 pro）
//     messages: [{ role: "system", content: "..." }],
//     thinking: { type: "enabled" | "disabled" },
//     response_format: { type: "json_object" },
//     reasoning_effort: "max" | "medium" | "low",
//     stream: false,
//     heartbeatMs: 2000,                    // 心跳间隔（毫秒），默认 2000
//   }
//
// 返回值格式：{ code: number, data: object, usage: object, message?: string }
//   code 200 — 成功
//   code 500 — API 调用失败
//   code 502 — 返回内容不符合预期

// 注意：openai v6+ 是纯 ESM 包，不能使用 require()，改为惰性动态 import
const { deepseek: config, DEEPSEEK_TIMEOUT } = require("../config");
const { recordTokenUsage } = require("./billing");

// ==================== 重试配置 ====================
// 最大重试次数（不含首次调用，即最多尝试 1 + 3 = 4 次）
const MAX_RETRIES = 3;
// 重试基础延迟（毫秒），使用指数退避：delay = baseDelay * 2^retry + 随机抖动
const RETRY_BASE_DELAY_MS = 1000;
// 最大重试延迟（毫秒），防止等待时间过长
const RETRY_MAX_DELAY_MS = 8000;

/**
 * 判断 API 错误是否可以重试
 * 可重试：503（服务繁忙/限流）、429（请求过多）、网络错误、超时错误
 * 不可重试：400（参数错误）、401（鉴权失败）、402（付费问题）等
 * @param {Error} error - API 调用错误对象
 * @returns {boolean} 是否应该重试
 */
function isRetryableError(error) {
    const message = (error.message || "").toLowerCase();
    // HTTP 503 — DeepSeek 服务繁忙/限流
    if (message.includes("503")) return true;
    // HTTP 429 — 请求过于频繁
    if (message.includes("429")) return true;
    // 网络层面的超时/连接重置等瞬时错误
    if (message.includes("timeout") || message.includes("timed out")) return true;
    if (message.includes("econnreset") || message.includes("econnrefused")) return true;
    if (message.includes("socket") && message.includes("hang up")) return true;
    if (message.includes("network") && message.includes("error")) return true;
    // 其他可重试的错误类型
    if (message.includes("service is too busy")) return true;
    if (message.includes("rate limit")) return true;
    if (message.includes("internal server error")) return true;
    // 默认不重试（400/401/402 等客户端错误）
    return false;
}

/**
 * 指数退避延迟计算（带随机抖动，避免惊群效应）
 * @param {number} retryCount - 当前重试次数（0-based，0=第1次重试）
 * @returns {number} 延迟毫秒数
 */
function getRetryDelay(retryCount) {
    // 指数退避: baseDelay * 2^retryCount
    const baseDelay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount);
    // 添加 ±25% 的随机抖动，避免多个并发重试同时发起
    const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
    const delay = Math.min(baseDelay + jitter, RETRY_MAX_DELAY_MS);
    return Math.round(delay);
}

/**
 * 同步延时等待（Promise 版 setTimeout）
 * @param {number} ms - 等待毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 惰性初始化 OpenAI 客户端 ====================
// 使用惰性初始化模式：首次调用时 import 并缓存，后续复用
// 大模型和小模型各自独立初始化客户端

let _openaiBig = null;   // 大模型（deepseek-v4-pro）客户端
let _openaiSmall = null; // 小模型（deepseek-v4-flash）客户端

/**
 * 惰性获取 OpenAI 客户端实例
 * @param {string} size - 模型大小："big"（pro）/ "small"（flash）
 * @returns {Promise<OpenAI>} OpenAI 客户端实例
 */
async function getClient(size) {
    if (size === "big" && _openaiBig) return _openaiBig;
    if (size === "small" && _openaiSmall) return _openaiSmall;

    const OpenAI = (await import("openai")).default;
    const apiConfig = size === "big" ? config.DEEPSEEK_API_BIG : config.DEEPSEEK_API_SMALL;

    const client = new OpenAI({
        baseURL: apiConfig.DEEPSEEK_API_BASE,
        apiKey: apiConfig.DEEPSEEK_API_KEY,
    });

    if (size === "big") {
        _openaiBig = client;
        console.log("[llm_client] OpenAI 大模型（pro）客户端已初始化（惰性加载）。");
    } else {
        _openaiSmall = client;
        console.log("[llm_client] OpenAI 小模型（flash）客户端已初始化（惰性加载）。");
    }

    return client;
}

// ==================== 核心函数：调用 DeepSeek API ====================

/**
 * 统一调用 DeepSeek API 并自动计费
 *
 * @param {string} userId - 用户 ID（用于计费关联）
 * @param {string} callTag - 调用标签（elaboration / outline / title / getline / htmlppt）
 * @param {Object} options - 调用选项
 * @param {string} options.modelSize - 模型大小："small"（flash）| "big"（pro）
 * @param {Array<{role: string, content: string}>} options.messages - 消息数组
 * @param {Object} [options.thinking] - 思考模式配置，如 { type: "enabled" }
 * @param {Object} [options.response_format] - 响应格式，如 { type: "json_object" }
 * @param {string} [options.reasoning_effort] - 推理努力度："max" | "medium" | "low"
 * @param {boolean} [options.stream=false] - 是否流式输出
 * @param {number} [options.heartbeatMs=2000] - 心跳间隔（毫秒），用于 devops 确认程序仍在等待
 * @returns {Promise<{ code: number, message?: { role: string, content: string }, usage?: object, message?: string }>}
 */
async function chat(userId, callTag, options = {}) {
    const TAG = "[llm_client]";
    const {
        modelSize = "small",
        messages,
        thinking,
        response_format,
        reasoning_effort,
        stream = false,
        heartbeatMs = 2000,
    } = options;

    // ========== 确定模型配置 ==========
    const apiConfig = modelSize === "big" ? config.DEEPSEEK_API_BIG : config.DEEPSEEK_API_SMALL;
    const modelName = apiConfig.DEEPSEEK_API_MODEL;
    const timeout = modelSize === "big" ? DEEPSEEK_TIMEOUT.BIG_MODEL : DEEPSEEK_TIMEOUT.SMALL_MODEL;

    console.log(TAG + " 准备调用 DeepSeek API — 模型: " + modelName + " (大小: " + modelSize + "), 标签: " + callTag);

    // ========== 获取 OpenAI 客户端 ==========
    const openai = await getClient(modelSize);

    // ========== 心跳定时器 ==========
    const heartbeatInterval = setInterval(() => {
        console.log(TAG + " 心跳 — 仍在等待 DeepSeek API 响应... (标签: " + callTag + ")");
    }, heartbeatMs);

    // ========== 看门狗定时器 ==========
    const watchdogTimer = setTimeout(() => {
        console.error(TAG + " !!! 看门狗超时 !!! DeepSeek API 在 " + (timeout / 1000) + " 秒内无任何响应 (标签: " + callTag + ")。");
    }, timeout);

    // ========== 调用 API（带重试逻辑） ==========
    let completion;
    let lastError = null;
    let finalRetryCount = 0;  // 记录最终的重试次数

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // 非首次尝试时：记录重试并等待指数退避延迟
        if (attempt > 0) {
            finalRetryCount = attempt;
            const delay = getRetryDelay(attempt - 1);
            console.log(TAG + " 第 " + attempt + " 次重试（共允许 " + MAX_RETRIES + " 次），等待 " + delay + "ms... (标签: " + callTag + ")");
            await sleep(delay);
        }

        try {
            // 构建调用参数
            const chatParams = {
                messages: messages,
                model: modelName,
                stream: stream,
                timeout: timeout,
            };

            // 可选参数：仅在有值时传入
            if (thinking) chatParams.thinking = thinking;
            if (response_format) chatParams.response_format = response_format;
            if (reasoning_effort) chatParams.reasoning_effort = reasoning_effort;

            completion = await openai.chat.completions.create(chatParams);
            // 调用成功，跳出重试循环
            lastError = null;
            break;
        } catch (apiError) {
            lastError = apiError;
            console.error(TAG + " DeepSeek API 调用失败（第 " + (attempt + 1) + " 次尝试）：" + apiError.message);

            // 判断是否应该重试
            if (attempt < MAX_RETRIES && isRetryableError(apiError)) {
                console.log(TAG + " 错误类型可重试，准备进行第 " + (attempt + 1) + " 次重试...");
                continue;  // 进入下一次重试
            }

            // 不可重试 或 已达最大重试次数，退出循环
            if (attempt >= MAX_RETRIES) {
                console.error(TAG + " 已达到最大重试次数（" + MAX_RETRIES + " 次），放弃重试。");
            } else {
                console.error(TAG + " 错误不可重试，放弃重试。");
            }
            break;
        }
    }

    // 所有尝试都失败
    if (lastError) {
        clearInterval(heartbeatInterval);
        clearTimeout(watchdogTimer);

        // 记录失败计费（包含错误原因和重试次数）
        recordTokenUsage({
            userId: userId,
            provider: "deepseek",
            model: modelName,
            callTag: callTag,
            status: "failed",
            promptTokens: 0,
            cacheHitTokens: 0,
            cacheMissTokens: 0,
            completionTokens: 0,
            errorMessage: lastError.message || "未知错误",  // 记录失败原因
            retryCount: finalRetryCount,                    // 记录重试次数
        }).catch(err => console.error(TAG + " 计费记录写入失败：" + err.message));

        return {
            code: 500,
            message: "DeepSeek API 调用失败：" + lastError.message
        };
    }

    // API 调用成功返回，清除定时器
    clearInterval(heartbeatInterval);
    clearTimeout(watchdogTimer);

    // ========== 校验返回结构 ==========
    if (!completion || !completion.choices || completion.choices.length === 0) {
        console.error(TAG + " DeepSeek API 返回内容为空或缺少 choices 字段。");
        return { code: 500, message: "DeepSeek API 返回内容为空。" };
    }

    // ========== 提取 usage 数据 ==========
    const usage = completion.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    // DeepSeek API 返回的缓存相关字段
    const cacheHitTokens = usage.prompt_cache_hit_tokens || usage.prompt_tokens_details?.cached_tokens || 0;
    const cacheMissTokens = Math.max(0, promptTokens - cacheHitTokens);
    const completionTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || (promptTokens + completionTokens);

    const resultContent = completion.choices[0].message.content;
    console.log(TAG + " DeepSeek API 调用成功 — 标签: " + callTag + ", 返回长度: " + (resultContent ? resultContent.length : 0) + " 字符");

    // ========== 自动计费（异步，不阻塞返回） ==========
    recordTokenUsage({
        userId: userId,
        provider: "deepseek",
        model: modelName,
        callTag: callTag,
        status: "success",
        promptTokens: promptTokens,
        cacheHitTokens: cacheHitTokens,
        cacheMissTokens: cacheMissTokens,
        completionTokens: completionTokens,
        totalTokens: totalTokens,
    }).catch(err => {
        console.error(TAG + " 计费记录写入失败：" + err.message);
    });

    // ========== 返回结果 ==========
    return {
        code: 200,
        message: completion.choices[0].message,  // { role, content }
        usage: usage,                             // 完整的 usage 对象（含缓存信息）
    };
}

// ==================== 流式调用 ====================

/**
 * 流式调用 DeepSeek API（支持 per-delta 回调 + 自动计费）
 * 替代 service/md2quiz/deepseek-client.js 的原生 fetch + SSE 手动解析
 * 使用 OpenAI SDK 原生流式接口，自动处理 SSE 解析、断线重连等底层细节
 *
 * @param {string} userId - 用户 ID（计费关联）
 * @param {string} callTag - 调用标签（用于计费分类，如 "md2quiz_split"、"md2quiz_format"）
 * @param {Object} options - 调用选项
 * @param {string} options.modelSize - 模型大小："big"（pro）| "small"（flash）
 * @param {Array<{role: string, content: string}>} options.messages - 消息数组
 * @param {(deltaText: string) => void} [options.onDelta] - per-delta 回调，每收到一个 delta 文本片段时触发
 * @param {Object} [options.thinking] - 思考模式配置，如 { type: "enabled" }（pro 模型）
 * @param {(thinkingText: string) => void} [options.onThinkingDelta] - 思考内容 delta 回调（thinking 模式下触发）
 * @param {Object} [options.response_format] - 响应格式，如 { type: "json_object" }
 * @param {number} [options.temperature=0.6] - 生成温度（0-2），越低越确定性
 * @returns {Promise<{model: string, content: string, usage: object|null, cost: number, thinkingContent: string}>} 聚合后的完整响应（cost 为本次费用元，thinkingContent 为思考过程）
 */
async function chatStream(userId, callTag, options = {}) {
    const { modelSize, messages, onDelta, response_format, temperature = 0.6, thinking, onThinkingDelta } = options;
    // 根据 modelSize 选择大/小模型配置
    const apiConfig = modelSize === "big" ? config.DEEPSEEK_API_BIG : config.DEEPSEEK_API_SMALL;
    const modelName = apiConfig.DEEPSEEK_API_MODEL;
    const timeout = modelSize === "big" ? DEEPSEEK_TIMEOUT.BIG_MODEL : DEEPSEEK_TIMEOUT.SMALL_MODEL;

    console.log("[llm_client:stream] 流式调用 — 模型: " + modelName + ", 标签: " + callTag + ", 消息数: " + messages.length);

    // ---- 心跳 + 看门狗定时器 ----
    const heartbeatInterval = setInterval(() => {
        console.log("[llm_client:stream] 心跳 — 等待中... (" + callTag + ")");
    }, 2000);
    const watchdogTimer = setTimeout(() => {
        console.error("[llm_client:stream] !!! 看门狗超时 (" + (timeout / 1000) + "s) — " + callTag);
    }, timeout);

    // 获取对应大小的 OpenAI 客户端
    const openai = await getClient(modelSize);
    let aggregatedContent = ""; // 聚合所有 delta 的完整内容
    let thinkingContent = "";   // 聚合 thinking 模式的推理内容（reasoning_content）
    let latestModel = modelName; // 跟踪实际使用的模型名
    let latestUsage = null;      // 最终的 token 用量信息

    try {
        // 使用 OpenAI SDK 流式接口
        const stream = await openai.chat.completions.create({
            model: modelName,
            messages,
            stream: true,
            temperature,
            response_format,
            stream_options: { include_usage: true }, // 让流式响应末 chunk 携带 usage，用于准确计费与上下文用量展示
            timeout,
            ...(thinking ? { thinking } : {}),
        });

        // 逐 chunk 读取流式响应
        for await (const chunk of stream) {
            // 记录实际使用的模型名和用量（最后一个 chunk 通常包含 usage）
            latestModel = chunk.model || latestModel;
            latestUsage = chunk.usage || latestUsage;

            // 提取 delta 文本内容
            const deltaContent = chunk.choices?.[0]?.delta?.content;
            if (deltaContent) {
                aggregatedContent += deltaContent;
                // 触发 per-delta 回调（用于进度更新）
                if (onDelta) {
                    onDelta(deltaContent);
                }
            }

            // 提取思考内容（DeepSeek reasoning_content，thinking 模式）
            const deltaThinking = chunk.choices?.[0]?.delta?.reasoning_content;
            if (deltaThinking) {
                thinkingContent += deltaThinking;
                if (onThinkingDelta) {
                    onThinkingDelta(deltaThinking);
                }
            }
        }
    } catch (err) {
        // 清理定时器
        clearInterval(heartbeatInterval);
        clearTimeout(watchdogTimer);

        // 失败计费（记录调用事实 + 错误原因，token=0）
        recordTokenUsage({
            userId, provider: "deepseek", model: modelName, callTag, status: "failed",
            promptTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 0,
            errorMessage: err.message || "未知错误",  // 记录失败原因
        }).catch(() => {});
        throw err;
    }

    // 清理定时器
    clearInterval(heartbeatInterval);
    clearTimeout(watchdogTimer);

    // ---- 空内容校验 ----
    if (!aggregatedContent) {
        throw new Error("DeepSeek 流式接口未返回有效内容。");
    }

    console.log("[llm_client:stream] 调用成功 — " + callTag + ", tokens: " + (latestUsage?.total_tokens || "?") + ", 内容长度: " + aggregatedContent.length);

    // ---- 成功计费（await 计费结果，返回本次费用供前端展示） ----
    let cost = 0;
    if (latestUsage) {
        const billed = await recordTokenUsage({
            userId,
            provider: "deepseek",
            model: latestModel,
            callTag,
            status: "success",
            promptTokens: latestUsage.prompt_tokens || 0,
            cacheHitTokens: latestUsage.prompt_cache_hit_tokens || 0,
            cacheMissTokens: latestUsage.prompt_cache_miss_tokens || 0,
            completionTokens: latestUsage.completion_tokens || 0,
            totalTokens: latestUsage.total_tokens || 0,
        }).catch((err) => {
            console.error("[llm_client:stream] 计费记录失败: " + err.message);
            return null;
        });
        cost = billed?.totalCost || 0;
    }

    return {
        model: latestModel,
        content: aggregatedContent,
        usage: latestUsage,
        cost: cost,
        thinkingContent: thinkingContent,
    };
}

// ==================== 模块导出 ====================
module.exports = { chat, chatStream, getClient };
