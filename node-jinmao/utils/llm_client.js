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

    // ========== 调用 API ==========
    let completion;
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
    } catch (apiError) {
        clearInterval(heartbeatInterval);
        clearTimeout(watchdogTimer);
        console.error(TAG + " DeepSeek API 调用失败：" + apiError.message);

        // 即使失败也记录计费（费用为 0，但记录调用事实）
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
        }).catch(err => console.error(TAG + " 计费记录写入失败：" + err.message));

        return {
            code: 500,
            message: "DeepSeek API 调用失败：" + apiError.message
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

// ==================== 模块导出 ====================
module.exports = { chat, getClient };
