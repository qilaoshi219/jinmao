// 本脚本接受编号后的md文本内容，将文本内容与提示词拼接后，发送给deepseek小模型进行行号识别，最后输出识别出来的startline和endline。
// 编写脚本时应首先进行输入校验，确保不是空字符串、不是null、不是undefined、不会出现注入攻击。
// 应为错误信息进行编号返回，如200等
// 返回值为 JSON 字符串，包含 startline 和 endline。同时错误信息也应包含在返回值，方便调用时判断是否成功。
// 提示词在config/getline_prompt.txt中，提示词的地址保存在config/prompt.json中。
// 本脚本的思考模式应该被关闭思考模式开关{"thinking": {"type": "disabled"}}，因为任务简单，不需要模型进行思考。
//
// 返回值 JSON 字符串格式（调用方用 JSON.parse 解析）：
//   { "code": 200, "startline": 27, "endline": 144 }         — 成功
//   { "code": 400, "message": "输入内容不能为空..." }          — 输入不合法
//   { "code": 500, "message": "DeepSeek API 调用失败..." }     — API 调用失败
//   { "code": 502, "message": "API 返回内容解析失败..." }      — 响应解析失败
//   { "code": 503, "message": "API 返回内容格式不符合预期..." } — 响应格式异常

// 注意：openai v6+ 是纯 ESM 包，不能使用 require()，改为惰性动态 import
const { deepseek: config } = require("../config");
const promptConfig = require("../config/prompt.json");
const fs = require("fs");
const path = require("path");
const { validateString } = require("./input_validator");

// ==================== 惰性初始化 OpenAI 客户端（使用小模型 DEEPSEEK_API_SMALL） ====================
// openai v6+ 是 ESM-only 模块，在 CommonJS 中无法 require，必须使用动态 import()
let _openai = null;
async function getOpenAI() {
    if (!_openai) {
        const OpenAI = (await import("openai")).default;
        _openai = new OpenAI({
            baseURL: config.DEEPSEEK_API_SMALL.DEEPSEEK_API_BASE,
            apiKey: config.DEEPSEEK_API_SMALL.DEEPSEEK_API_KEY,
        });
        console.log("[get_line] OpenAI 客户端已初始化（惰性加载）");
    }
    return _openai;
}

// ==================== 读取提示词模板（模块加载时一次性读取，避免每次调用重复 IO） ====================
// 从 prompt.json 中读取 getline_prompt 的路径，再读取对应的提示词文本文件
const getlinePromptPath = path.resolve(__dirname, promptConfig.getline_prompt);
const GETLINE_PROMPT = fs.readFileSync(getlinePromptPath, "utf8");
console.log("[get_line] 提示词模板已加载，路径：" + getlinePromptPath + "，长度：" + GETLINE_PROMPT.length + " 字符。");

// validateInput 已迁移至公共验证模块 input_validator.js，通过 validateString 统一调用

/**
 * 将已编号的 Markdown 文本发送给 DeepSeek 小模型，识别适合做 PPT 的章节起止行号
 *
 * 处理流程：
 *   1. 输入验证（空值/类型/注入/长度）
 *   2. 将提示词模板与编号后的文本拼接
 *   3. 调用 DeepSeek API（小模型 + 关闭思考模式）
 *   4. 解析 API 返回的 JSON，提取 firstnum（startline）和 endnum（endline）
 *   5. 返回结果对象
 *
 * 返回值：对象
 *   - 成功：{ code: 200, startline: number, endline: number }
 *   - 失败：{ code: xxx, message: "错误描述" }
 *
 * @param {string} indexedMarkdown - 已通过 line_indexer.js 添加行号索引的 Markdown 文本
 * @returns {Promise<{code: number, startline?: number, endline?: number, message?: string}>}
 */
async function getLine(indexedMarkdown) {
    // ========== 步骤 1：前置输入验证（使用公共验证模块） ==========
    const validationResult = validateString(indexedMarkdown, "已编号的 Markdown 文本", {
        maxLength: 100000,
        required: true,
        moduleTag: "[get_line]"
    });
    if (!validationResult.valid) {
        console.error("[get_line] 输入验证未通过（code=" + validationResult.errorCode + "），拒绝执行：" + validationResult.error);
        return {
            code: validationResult.errorCode,
            message: validationResult.error
        };
    }
    console.log("[get_line] 输入验证通过，开始执行行号识别流程。");

    // ========== 惰性获取 OpenAI 客户端（ESM 动态 import） ==========
    const openai = await getOpenAI();

    // ========== 步骤 2：拼接提示词与待分析文本 ==========
    // 提示词模板 + 换行分隔 + 编号后 Markdown 文本
    const fullPrompt = GETLINE_PROMPT + "\n\n---\n\n**待分析文本（每行前为行号索引）：**\n\n" + indexedMarkdown;
    console.log("[get_line] 提示词与文本拼接完成，总长度：" + fullPrompt.length + " 字符。准备调用 DeepSeek API（小模型，思考模式已关闭）。");

    // ========== 步骤 3：调用 DeepSeek API（小模型 + 关闭思考模式） ==========
    let completion;
    try {
        completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: fullPrompt }],  // 系统提示词（含待分析文本）
            model: config.DEEPSEEK_API_SMALL.DEEPSEEK_API_MODEL,  // 小模型（deepseek-v4-flash）
            thinking: { "type": "disabled" },                      // 关闭思考模式（任务简单，无需深度推理）
            stream: false,                                          // 非流式输出，等待完整结果
        });
    } catch (apiError) {
        // 捕获 API 调用层面的所有错误（网络超时、鉴权失败、服务端 5xx 等）
        console.error("[get_line] DeepSeek API 调用失败：" + apiError.message);
        return {
            code: 500,
            message: "DeepSeek API 调用失败：" + apiError.message
        };
    }

    // ========== 步骤 4：校验 API 返回结构的完整性 ==========
    // 确保 choices 数组存在且不为空
    if (!completion || !completion.choices || completion.choices.length === 0) {
        console.error("[get_line] DeepSeek API 返回内容为空或缺少 choices 字段。");
        return {
            code: 500,
            message: "DeepSeek API 返回内容为空，未能获取有效的行号识别数据。"
        };
    }

    // ========== 步骤 5：解析 API 返回的 JSON 结果 ==========
    const resultText = completion.choices[0].message.content;
    console.log("[get_line] DeepSeek API 调用成功，返回内容长度：" + resultText.length + " 字符。");
    console.log("[get_line] API 原始返回内容：\n" + resultText);

    let parsedResult;
    try {
        // 尝试清理可能的 markdown 代码块包裹（如 ```json ... ```）
        let cleanText = resultText.trim();
        // 去除可能的 ```json 和 ``` 包裹
        const codeBlockMatch = cleanText.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
        if (codeBlockMatch) {
            cleanText = codeBlockMatch[1].trim();
            console.log("[get_line] 检测到 markdown 代码块包裹，已自动去除。");
        }
        parsedResult = JSON.parse(cleanText);
    } catch (parseError) {
        // 解析失败 —— 可能 API 返回了非 JSON 格式的内容
        console.error("[get_line] API 返回内容 JSON 解析失败：" + parseError.message);
        return {
            code: 502,
            message: "DeepSeek 返回的内容不是合法的 JSON 格式，解析失败：" + parseError.message
        };
    }

    // ========== 步骤 6：校验解析结果的结构是否符合预期 ==========
    // 期望格式：[{"id": 1, "firstnum": 27, "endnum": 144}]
    // 校验是否为数组、数组是否非空、第一个元素是否包含 firstnum 和 endnum 字段
    if (!Array.isArray(parsedResult)) {
        console.error("[get_line] API 返回结果不是数组格式，实际类型：" + typeof parsedResult);
        return {
            code: 503,
            message: "API 返回结果格式不符合预期：期望 JSON 数组，实际为 " + typeof parsedResult + "。"
        };
    }
    if (parsedResult.length === 0) {
        console.error("[get_line] API 返回数组为空，未识别到任何可用章节。");
        return {
            code: 503,
            message: "API 返回数组为空，未识别到任何可用章节。"
        };
    }

    const firstItem = parsedResult[0];
    // 校验 firstnum 和 endnum 字段是否存在且为数字
    if (typeof firstItem.firstnum !== "number" || typeof firstItem.endnum !== "number") {
        console.error("[get_line] API 返回结果缺少 firstnum 或 endnum 字段，或字段类型不是 number。实际内容：" + JSON.stringify(firstItem));
        return {
            code: 503,
            message: "API 返回结果字段不完整：期望包含 firstnum（数字）和 endnum（数字），实际内容：" + JSON.stringify(firstItem) + "。"
        };
    }

    // ========== 步骤 7：成功 —— 返回 startline 和 endline ==========
    const startline = firstItem.firstnum;
    const endline = firstItem.endnum;
    console.log("[get_line] 行号识别成功：startline=" + startline + "，endline=" + endline + "。");

    return {
        code: 200,
        startline: startline,
        endline: endline
    };
}

// 导出 getLine 和 validateInput，供其他模块通过 require 调用
module.exports = { getLine };
