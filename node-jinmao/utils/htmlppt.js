// 该模块负责将 PPT 生成指引转换为互动式 HTML PPT，调用 DeepSeek 大模型生成自包含的单文件 HTML 幻灯片页面
// 输入参数：
//   pptGuide    — string，PPT 生成指引文本（描述 PPT 结构、风格、页数、每页内容等）
//   originalText — string，教材原文（用于填充 PPT 内容的原始教材文本）
//   imageUrls   — string[]，可选的图片 URL 数组（为空数组时正常生成无图片的 PPT）
// 返回值格式：{ code: number, html?: string, message?: string }
//   code 200 — 成功生成 HTML PPT，html 包含完整的 HTML 代码
//   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限/数组格式异常）
//   code 500 — DeepSeek API 调用失败（网络错误、服务端错误、返回空内容）
//   code 502 — API 返回内容不是有效 HTML（缺少必要的 HTML 标记）

const OpenAI = require("openai");
const { deepseek: config } = require("../config");
const prompt = require("../config/prompt.json");
const fs = require("fs");
const path = require("path");
const { validateString } = require("./input_validator");

// 初始化 OpenAI 客户端（使用 DEEPSEEK_API_BIG 大模型，因为 HTML 生成为复杂任务）
const openai = new OpenAI({
    baseURL: config.DEEPSEEK_API_BIG.DEEPSEEK_API_BASE,
    apiKey: config.DEEPSEEK_API_BIG.DEEPSEEK_API_KEY,
});

console.log("[htmlppt] OpenAI 客户端已初始化，模型：" + config.DEEPSEEK_API_BIG.DEEPSEEK_API_MODEL + "。");

// validateInput 已迁移至公共验证模块 input_validator.js，字符串校验通过 validateString 统一调用，数组校验保留在 main 中

/**
 * 调用 DeepSeek 生成互动式 HTML PPT（仅返回数据，不负责文件持久化）
 * 
 * 返回值格式：{ code: number, html?: string, message?: string }
 * 
 * 状态码说明：
 *   code 200 — 成功生成 HTML PPT，html 包含完整的 HTML 代码
 *   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限/数组格式异常）
 *   code 500 — DeepSeek API 调用失败（网络错误、服务端错误、返回空内容）
 *   code 502 — API 返回内容不是有效 HTML（缺少必要的 HTML 标记）
 * 
 * @param {string} pptGuide - PPT 生成指引文本
 * @param {string} originalText - 教材原文内容
 * @param {string[]} imageUrls - 图片 URL 数组（可为空数组）
 * @returns {{ code: number, html?: string, message?: string }}
 *   始终返回对象，不会抛出异常。调用方根据 code 判断结果：
 *   - code 200 时 html 有值，可直接使用
 *   - code ≥ 400 时 html 为 undefined，通过 message 了解失败原因
 */
async function main(pptGuide, originalText, imageUrls) {
    // ========== 前置输入验证：使用公共验证模块拦截非法输入 ==========
    // 1. 字符串字段使用公共验证器
    for (const [value, fieldName, maxLen] of [
        [pptGuide, "PPT生成指引(pptGuide)", 10000],
        [originalText, "教材原文(originalText)", 50000]
    ]) {
        const result = validateString(value, fieldName, { maxLength: maxLen, required: true, moduleTag: "[htmlppt]" });
        if (!result.valid) {
            console.error("[htmlppt] 输入验证未通过（code=" + result.errorCode + "），拒绝执行：" + result.error);
            return { code: result.errorCode, message: result.error };
        }
    }

    // 2. imageUrls 数组校验（公共模块不包含数组校验，在此处处理）
    if (!Array.isArray(imageUrls)) {
        return { code: 400, message: "图片URL列表(imageUrls)必须为数组类型，如无图片请传入空数组 []。" };
    }
    const MAX_IMAGEURL_COUNT = 50;
    const MAX_IMAGEURL_LENGTH = 2000;
    if (imageUrls.length > MAX_IMAGEURL_COUNT) {
        return { code: 400, message: "图片URL列表(imageUrls)长度超过限制（最大 " + MAX_IMAGEURL_COUNT + " 个）。" };
    }
    for (let i = 0; i < imageUrls.length; i++) {
        const url = imageUrls[i];
        if (typeof url !== "string") {
            return { code: 400, message: "图片URL列表(imageUrls)中第 " + (i + 1) + " 个元素必须为字符串类型。" };
        }
        const urlResult = validateString(url, "imageUrls[" + i + "]", { maxLength: MAX_IMAGEURL_LENGTH, required: true, moduleTag: "[htmlppt]" });
        if (!urlResult.valid) {
            return { code: urlResult.errorCode, message: urlResult.error };
        }
    }

    console.log("[htmlppt] 输入验证通过，开始执行 HTML PPT 生成流程。");

    // ========== 读取 Prompt 模板并替换占位符 ==========
    const htmlPptPromptPath = path.resolve(__dirname, prompt.html_ppt_prompt);
    const htmlPptPrompt = fs.readFileSync(htmlPptPromptPath, "utf8");
    // 替换 prompt 模板中的 {{pptGuide}}、{{originalText}}、{{imageUrls}} 占位符
    let formattedPrompt = htmlPptPrompt.replace("{{pptGuide}}", pptGuide);
    formattedPrompt = formattedPrompt.replace("{{originalText}}", originalText);
    // 将 imageUrls 数组序列化为 JSON 字符串后替换，方便模型解析
    formattedPrompt = formattedPrompt.replace("{{imageUrls}}", JSON.stringify(imageUrls));
    console.log("[htmlppt] Prompt 模板已加载并替换占位符，准备调用 DeepSeek API。");

    // ========== 调用 DeepSeek API 生成 HTML PPT ==========
    // 注意：此处不使用 response_format: json_object，因为输出是 HTML 代码而非 JSON
    let completion;
    try {
        completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: formattedPrompt }],   // 系统提示词
            model: config.DEEPSEEK_API_BIG.DEEPSEEK_API_MODEL,          // deepseek-v4-pro
            thinking: { "type": "enabled" },                             // 开启思考模式（HTML 生成为复杂任务）
            reasoning_effort: "max",                                     // 最大思考努力
            stream: false,
        });
    } catch (apiError) {
        // 捕获 API 调用层面的所有错误（网络超时、鉴权失败、服务端 5xx 等）
        console.error("[htmlppt] DeepSeek API 调用失败：" + apiError.message);
        return {
            code: 500,
            message: "DeepSeek API 调用失败：" + apiError.message
        };
    }

    // ========== 校验 API 返回结构的完整性 ==========
    // 确保 choices 数组存在且不为空
    if (!completion || !completion.choices || completion.choices.length === 0) {
        console.error("[htmlppt] DeepSeek API 返回内容为空或缺少 choices 字段。");
        return {
            code: 500,
            message: "DeepSeek API 返回内容为空，未能获取有效的 HTML 数据。"
        };
    }

    // ========== 获取并清理 API 返回的 HTML 内容 ==========
    let resultHtml = completion.choices[0].message.content;
    console.log("[htmlppt] DeepSeek API 调用成功，返回内容长度：" + resultHtml.length + " 字符。");

    // 检查返回内容是否为空
    if (!resultHtml || resultHtml.trim() === "") {
        console.error("[htmlppt] API 返回的 HTML 内容为空。");
        return {
            code: 500,
            message: "DeepSeek API 返回的 HTML 内容为空。"
        };
    }

    // ========== 清理可能的 markdown 代码块包裹 ==========
    // DeepSeek 有时会在输出中包裹 ```html ... ``` 标记，需要自动 strip
    // 匹配以 ```html（可能带语言标识）开头、以 ``` 结尾的代码块
    const markdownBlockRegex = /^```(?:html)?\s*\n?([\s\S]*?)\n?\s*```\s*$/;
    const markdownMatch = resultHtml.match(markdownBlockRegex);
    if (markdownMatch) {
        resultHtml = markdownMatch[1];  // 提取代码块内部的内容
        console.log("[htmlppt] 检测到 markdown 代码块包裹，已自动剥离。");
    }

    // 去除首尾空白
    resultHtml = resultHtml.trim();

    // ========== 校验返回内容是否为有效 HTML ==========
    // 检查是否包含必要的 HTML 结构标记
    const lowerHtml = resultHtml.toLowerCase();
    const hasValidHtmlMarkers = lowerHtml.includes("<!doctype")  // 完整文档声明
        || lowerHtml.includes("<html")                           // <html> 标签
        || lowerHtml.includes("<body");                          // <body> 标签

    if (!hasValidHtmlMarkers) {
        console.error("[htmlppt] API 返回内容不包含有效 HTML 标记，内容预览：" + resultHtml.substring(0, 200) + "...");
        return {
            code: 502,
            message: "DeepSeek 返回的内容不是有效的 HTML 格式，缺少必要的 HTML 标记（如 <!DOCTYPE>、<html> 或 <body>）。"
        };
    }

    // ========== 成功：返回 HTML 代码 ==========
    console.log("[htmlppt] HTML PPT 生成成功，HTML 长度：" + resultHtml.length + " 字符。");
    return {
        code: 200,
        html: resultHtml
    };
}

module.exports = { generateHtmlPpt: main };
