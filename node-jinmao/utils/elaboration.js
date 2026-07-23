// 该模块负责调用 DeepSeek 大模型对原始口播稿进行扩写细化，仅返回 JSON 内容，不负责文件持久化
// 输入：原始口播稿(elaboration)、教材原文(original)、预期字数(expectedWords)
// 提示词从 config/prompt.json 的 elaboration_prompt 字段指定的文件中加载
// 占位符替换：{{elaboration}}→原始口播稿、{{original}}→教材原文、{{expected_words}}→预期字数
// DeepSeek 返回 JSON 格式：{"script": "扩写后的口播稿文本..."}
// 返回值格式：{ code: number, script?: string, message?: string }
//   code 200 — 成功扩写，script 包含扩写后的口播稿文本
//   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限等）
//   code 500 — DeepSeek API 调用失败（网络错误、服务端错误等）
//   code 502 — DeepSeek 返回内容不是合法 JSON，解析失败
//   code 503 — DeepSeek 返回 JSON 不包含 script 字段
// Please install OpenAI SDK first: `npm install openai`

// 注意：openai v6+ 是纯 ESM 包，不能使用 require()，改为惰性动态 import
const { deepseek: config, DEEPSEEK_TIMEOUT } = require("../config");
const prompt = require("../config/prompt.json");
const fs = require("fs");
const path = require("path");
const { validateFields } = require("./input_validator");

// ==================== 惰性初始化 OpenAI 客户端 ====================
// openai v6+ 是 ESM-only 模块，在 CommonJS 中无法 require，必须使用动态 import()
// 使用惰性初始化模式：首次调用时 import 并缓存，后续复用
let _openai = null;
async function getOpenAI() {
    if (!_openai) {
        const OpenAI = (await import("openai")).default;
        _openai = new OpenAI({
            baseURL: config.DEEPSEEK_API_SMALL.DEEPSEEK_API_BASE,
            apiKey: config.DEEPSEEK_API_SMALL.DEEPSEEK_API_KEY,
        });
        console.log("[elaboration] OpenAI 客户端已初始化（惰性加载）");
    }
    return _openai;
}

// validateInput 已迁移至公共验证模块 input_validator.js，通过 validateFields 统一调用

/**
 * 调用 DeepSeek 大模型对口播稿进行扩写细化（仅返回数据，不负责文件持久化）
 * 
 * 返回值格式：{ code: number, script?: string, message?: string }
 * 
 * 状态码说明：
 *   code 200 — 成功扩写，script 包含扩写后的口播稿文本
 *   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限等）
 *   code 500 — DeepSeek API 调用失败（网络错误、服务端错误、API 返回异常等）
 *   code 502 — DeepSeek 返回内容不是合法 JSON，解析失败
 *   code 503 — DeepSeek 返回 JSON 不包含 script 字段
 * 
 * @param {string} elaboration - 原始口播稿内容
 * @param {string} original - 教材原文内容
 * @param {number|string} expectedWords - 预期字数
 * @returns {Promise<{ code: number, script?: string, message?: string }>}
 *   始终返回对象，不会抛出异常。调用方根据 code 判断结果：
 *   - code 200 时 script 有值，可直接使用
 *   - code ≥ 400 时 script 为 undefined，通过 message 了解失败原因
 */
async function main(elaboration, original, expectedWords) {
    // ========== 前置输入验证：使用公共验证模块拦截非法输入 ==========
    const validationResult = validateFields({
        elaboration: {
            value: elaboration,
            type: "string",
            options: { maxLength: 20000, required: true }
        },
        original: {
            value: original,
            type: "string",
            options: { maxLength: 50000, required: true }
        },
        expectedWords: {
            value: expectedWords,
            type: "number",
            options: { min: 10, max: 50000, required: true }
        }
    }, "[elaboration]");
    if (!validationResult.valid) {
        console.error("[elaboration][main] 输入验证未通过（code=" + validationResult.errorCode + "），拒绝执行：" + validationResult.error);
        return {
            code: validationResult.errorCode,
            message: validationResult.error
        };
    }
    const { expectedWords: parsedWords } = validationResult.parsedValues;
    console.log("[elaboration][main] 输入验证通过，预期字数: " + parsedWords + "。开始执行口播稿扩写流程。");

    // ========== 惰性获取 OpenAI 客户端（ESM 动态 import） ==========
    const openai = await getOpenAI();

    // ========== 读取 Prompt 模板并替换占位符 ==========
    console.log("[elaboration][main] 正在加载提示词模板：" + prompt.elaboration_prompt);
    const elaborationPromptPath = path.resolve(__dirname, prompt.elaboration_prompt);
    const elaborationPrompt = fs.readFileSync(elaborationPromptPath, "utf8");
    // 替换prompt模板中的三个占位符：{{elaboration}}、{{original}}、{{expected_words}}
    let formattedPrompt = elaborationPrompt.replace("{{elaboration}}", elaboration);
    formattedPrompt = formattedPrompt.replace("{{original}}", original);
    formattedPrompt = formattedPrompt.replace("{{expected_words}}", String(parsedWords));
    console.log("[elaboration][main] 提示词模板已加载并替换占位符，准备调用 DeepSeek API。");

    // ========== 调用 DeepSeek API 生成扩写后的口播稿 ==========
    // 启动心跳定时器：每 2 秒输出一次状态，确保运维人员知道程序仍在等待大模型响应
    const heartbeatInterval = setInterval(() => {
        console.log("[elaboration] 心跳 — 仍在等待 DeepSeek 大模型响应...");
    }, 2000);

    // ========== 看门狗定时器：5 分钟 ==========
    // 仅在极其特殊的情况下触发（如 openai SDK 内部卡死、网络黑洞等），
    // 正常情况下 DeepSeek API 会先返回成功或错误，看门狗会被提前清理（clearTimeout）
    const watchdogTimer = setTimeout(() => {
        console.error("[elaboration] !!! 看门狗超时 !!! DeepSeek API 在 " + (DEEPSEEK_TIMEOUT.BIG_MODEL / 1000) + " 秒内无任何响应，可能发生了极端异常（网络黑洞/SDK卡死等）。");
    }, DEEPSEEK_TIMEOUT.BIG_MODEL);

    let completion;
    try {
        completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: formattedPrompt }],// 系统提示词
            model: config.DEEPSEEK_API_SMALL.DEEPSEEK_API_MODEL,// 模型名称（deepseek-v4-flash）
            thinking: { "type": "enabled" },// 思考模式（大模型处理复杂扩写任务）
            response_format: { "type": "json_object" },// json格式优化输出
            reasoning_effort: "max",// 最大思考努力
            stream: false,
            timeout: DEEPSEEK_TIMEOUT.SMALL_MODEL, // HTTP 请求级超时 5 分钟，DeepSeek 发送的空行/keep-alive 会维持连接
        });
    } catch (apiError) {
        // API 调用失败，清除心跳和看门狗定时器
        clearInterval(heartbeatInterval);
        clearTimeout(watchdogTimer);
        // 捕获 API 调用层面的所有错误（网络超时、鉴权失败、服务端 5xx 等）
        console.error("[elaboration][main] DeepSeek API 调用失败：" + apiError.message);
        return {
            code: 500,
            message: "DeepSeek API 调用失败：" + apiError.message
        };
    }

    // API 调用成功返回，清除心跳和看门狗定时器
    clearInterval(heartbeatInterval);
    clearTimeout(watchdogTimer);

    // ========== 校验 API 返回结构的完整性 ==========
    // 确保 choices 数组存在且不为空
    if (!completion || !completion.choices || completion.choices.length === 0) {
        console.error("[elaboration][main] DeepSeek API 返回内容为空或缺少 choices 字段。");
        return {
            code: 500,
            message: "DeepSeek API 返回内容为空，未能获取有效的口播稿数据。"
        };
    }

    // ========== 解析 DeepSeek 返回的 JSON ==========
    const resultText = completion.choices[0].message.content;
    console.log("[elaboration][main] DeepSeek API 调用成功，返回内容长度：" + resultText.length + " 字符。");

    let result;
    try {
        result = JSON.parse(resultText);
    } catch (parseError) {
        // 解析失败 —— 可能 API 返回了非 JSON 格式的内容
        console.error("[elaboration][main] API 返回内容 JSON 解析失败：" + parseError.message);
        return {
            code: 502,
            message: "DeepSeek 返回的内容不是合法的 JSON 格式，解析失败：" + parseError.message
        };
    }

    // ========== 校验返回 JSON 是否包含 script 字段 ==========
    if (!result.script || typeof result.script !== "string") {
        console.error("[elaboration][main] API 返回 JSON 不包含有效的 script 字段。");
        return {
            code: 503,
            message: "DeepSeek 返回的 JSON 不包含 script 字段或 script 不是字符串类型。"
        };
    }

    // ========== 成功：返回扩写后的口播稿文本 ==========
    console.log("[elaboration][main] 口播稿扩写成功，输出脚本长度：" + result.script.length + " 字符。");
    return {
        code: 200,
        script: result.script
    };
}

// ==================== 模块导出 ====================
module.exports = { elaborateText: main };
