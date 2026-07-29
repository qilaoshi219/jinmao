// 该模块负责将 PPT 生成指引转换为互动式 HTML PPT，调用 DeepSeek 大模型生成自包含的单文件 HTML 幻灯片页面
// 输入参数：
//   pptGuide    — string，PPT 生成指引文本（描述 PPT 结构、风格、页数、每页内容等）
//   originalText — string，教材原文（用于填充 PPT 内容的原始教材文本）
//   imageInfos  — (string|object)[]，可选的图片信息数组（为空数组时正常生成无图片的 PPT）
//                  支持两种格式：旧格式 string[]（纯 URL）、新格式 object[]（{url, desc} 含描述）
// 返回值格式：{ code: number, html?: string, message?: string }
//   code 200 — 成功生成 HTML PPT，html 包含完整的 HTML 代码
//   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限/数组格式异常）
//   code 500 — DeepSeek API 调用失败（网络错误、服务端错误、返回空内容）
//   code 502 — API 返回内容不是有效 HTML（缺少必要的 HTML 标记）

const prompt = require("../config/prompt.json");
const fs = require("fs");
const path = require("path");
const { validateString } = require("./input_validator");
const llmClient = require("./llm_client"); // 统一 LLM 客户端（替代直接调用 OpenAI）

/**
 * 调用 DeepSeek（通过 llm_client）生成互动式 HTML PPT（仅返回数据，不负责文件持久化）
 * 
 * 返回值格式：{ code: number, html?: string, message?: string }
 * 
 * 状态码说明：
 *   code 200 — 成功生成 HTML PPT，html 包含完整的 HTML 代码
 *   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限/数组格式异常）
 *   code 500 — DeepSeek API 调用失败（网络错误、服务端错误、返回空内容）
 *   code 502 — API 返回内容不是有效 HTML（缺少必要的 HTML 标记）
 * 
 * @param {string} userId - 用户 ID（用于 llm_client 计费关联）
 * @param {string} pptGuide - PPT 生成指引文本
 * @param {string} originalText - 教材原文内容
 * @param {(string|object)[]} imageInfos - 图片信息数组，支持两种格式：
 *   - 旧格式（string[]）：纯图片 URL 字符串，如 ["https://.../a.jpg", "https://.../b.jpg"]
 *   - 新格式（object[]）：含描述的对象，如 [{url: "https://.../a.jpg", desc: "图 2-1-1 xxx"}]
 *   两种格式可混用，空数组表示无图片
 * @returns {{ code: number, html?: string, message?: string }}
 *   始终返回对象，不会抛出异常。调用方根据 code 判断结果：
 *   - code 200 时 html 有值，可直接使用
 *   - code ≥ 400 时 html 为 undefined，通过 message 了解失败原因
 */
async function main(userId, pptGuide, originalText, imageInfos) {
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

    // 2. imageInfos 数组校验（兼容字符串和对象两种格式）
    if (!Array.isArray(imageInfos)) {
        return { code: 400, message: "图片信息列表(imageInfos)必须为数组类型，如无图片请传入空数组 []。" };
    }
    const MAX_IMAGE_COUNT = 50;
    const MAX_URL_LENGTH = 2000;
    const MAX_DESC_LENGTH = 500; // 图片描述最大长度
    if (imageInfos.length > MAX_IMAGE_COUNT) {
        return { code: 400, message: "图片信息列表(imageInfos)长度超过限制（最大 " + MAX_IMAGE_COUNT + " 个）。" };
    }
    for (let i = 0; i < imageInfos.length; i++) {
        const item = imageInfos[i];
        const itemType = typeof item;
        // 兼容旧格式：纯字符串 URL
        if (itemType === "string") {
            const urlResult = validateString(item, "imageInfos[" + i + "].url", { maxLength: MAX_URL_LENGTH, required: true, moduleTag: "[htmlppt]" });
            if (!urlResult.valid) {
                return { code: urlResult.errorCode, message: urlResult.error };
            }
        } else if (itemType === "object" && item !== null) {
            // 新格式：{ url, desc } 对象
            if (typeof item.url !== "string") {
                return { code: 400, message: "图片信息列表(imageInfos)中第 " + (i + 1) + " 个元素缺少 url 字段或 url 不是字符串。" };
            }
            const urlResult = validateString(item.url, "imageInfos[" + i + "].url", { maxLength: MAX_URL_LENGTH, required: true, moduleTag: "[htmlppt]" });
            if (!urlResult.valid) {
                return { code: urlResult.errorCode, message: urlResult.error };
            }
            // desc 字段可选，但如果有则需校验
            if (item.desc !== undefined && item.desc !== null) {
                if (typeof item.desc !== "string") {
                    return { code: 400, message: "图片信息列表(imageInfos)中第 " + (i + 1) + " 个元素的 desc 字段必须为字符串。" };
                }
                const descResult = validateString(item.desc, "imageInfos[" + i + "].desc", { maxLength: MAX_DESC_LENGTH, required: false, moduleTag: "[htmlppt]" });
                if (!descResult.valid) {
                    return { code: descResult.errorCode, message: descResult.error };
                }
            }
        } else {
            return { code: 400, message: "图片信息列表(imageInfos)中第 " + (i + 1) + " 个元素类型无效，必须为字符串或 {url, desc} 对象。" };
        }
    }

    console.log("[htmlppt] 输入验证通过，开始执行 HTML PPT 生成流程。");

    // ========== 读取 Prompt 模板并替换占位符 ==========
    const htmlPptPromptPath = path.resolve(__dirname, prompt.html_ppt_prompt);
    const htmlPptPrompt = fs.readFileSync(htmlPptPromptPath, "utf8");
    // 替换 prompt 模板中的 {{pptGuide}}、{{originalText}}、{{imageUrls}} 占位符
    let formattedPrompt = htmlPptPrompt.replace("{{pptGuide}}", pptGuide);
    formattedPrompt = formattedPrompt.replace("{{originalText}}", originalText);
    // 将 imageInfos 数组格式化为可读文本，方便模型理解每张图片的 URL、内容和尺寸
    // 三种情况：空数组 → "本页无配图"；纯字符串 → 只列 URL；对象 → 列 URL + 描述 + 尺寸
    let imageText;
    if (imageInfos.length === 0) {
        imageText = "本页无配图";
    } else {
        imageText = imageInfos.map((item, i) => {
            if (typeof item === "string") {
                // 旧格式：纯 URL 字符串，无描述和尺寸
                return "图片" + (i + 1) + ": URL=" + item + ", 描述=无";
            } else {
                // 新格式：{ url, desc, width?, height? } 对象
                let line = "图片" + (i + 1) + ": URL=" + item.url + ", 描述=" + (item.desc || "无");
                // 注入像素尺寸信息（如果存在）
                if (item.width && item.height) {
                    line += ", 原始尺寸=" + item.width + "x" + item.height + "px";
                } else {
                    line += ", 原始尺寸=未知";
                }
                return line;
            }
        }).join("\n");
    }
    formattedPrompt = formattedPrompt.replace("{{imageUrls}}", imageText);
    console.log("[htmlppt] 图片信息（共 " + imageInfos.length + " 张）已格式化并替换到 Prompt 模板。");

    // ========== 调用 llm_client 统一接口生成 HTML PPT ==========
    // llm_client 内部处理了客户端初始化、心跳、看门狗、自动计费等
    // 注意：此处不使用 response_format: json_object，因为输出是 HTML 代码而非 JSON
    const chatResult = await llmClient.chat(userId, "htmlppt", {
        modelSize: "big",                                               // 使用大模型（deepseek-v4-pro），HTML 生成需要深度推理
        messages: [{ role: "system", content: formattedPrompt }],       // 系统提示词
        stream: false,                                                   // 非流式输出
    });

    // 检查 llm_client 返回码
    if (chatResult.code !== 200) {
        console.error("[htmlppt] llm_client 调用失败：" + (chatResult.message || "未知错误"));
        return {
            code: 500,
            message: "DeepSeek API 调用失败：" + (chatResult.message || "未知错误")
        };
    }

    // ========== 获取并清理 API 返回的 HTML 内容 ==========
    let resultHtml = chatResult.message.content;
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

    // ========== 自动提取 HTML 内容（从 <!DOCTYPE html> 或 <html 标签开始） ==========
    // DeepSeek 有时会在 HTML 代码前添加解释性文字（如"我已经根据你的要求，生成了..."），
    // 需要自动截取真正的 HTML 内容部分
    const doctypeIndex = resultHtml.indexOf("<!DOCTYPE html>");
    const htmlTagIndex = resultHtml.indexOf("<html");
    
    if (doctypeIndex !== -1) {
        // 找到 <!DOCTYPE html> 声明，从该位置截取
        if (doctypeIndex > 0) {
            console.log("[htmlppt] 检测到 HTML 代码前有 " + doctypeIndex + " 字符的解释文字，已自动截断。");
        }
        resultHtml = resultHtml.substring(doctypeIndex);
    } else if (htmlTagIndex !== -1) {
        // 没有 DOCTYPE 声明但有 <html> 标签，从 <html> 开始截取
        if (htmlTagIndex > 0) {
            console.log("[htmlppt] 检测到 HTML 代码前有 " + htmlTagIndex + " 字符的解释文字（无 DOCTYPE），已自动截断。");
        }
        resultHtml = resultHtml.substring(htmlTagIndex);
    } else {
        // 如果既没有 <!DOCTYPE html> 也没有 <html> 标签，尝试查找其他HTML特征标记
        // 可能是以 <body> 或 <div> 开头的片段
        const bodyIndex = resultHtml.indexOf("<body");
        if (bodyIndex !== -1 && bodyIndex > 0 && bodyIndex < 100) {
            console.log("[htmlppt] 检测到 HTML 代码前有解释文字，从 <body> 标签截断（偏移 " + bodyIndex + " 字符）。");
            resultHtml = resultHtml.substring(bodyIndex);
        }
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

    // ========== URL 规范化：将 AI 可能生成的绝对 URL 转为相对路径 ==========
    // AI 模型有时会"聪明地"把相对路径 /api/v1/files/... 补全为绝对 URL，
    // 如 https://jinmao.ckstu.top:30080/api/v1/files/...，导致浏览器用错误协议访问。
    // 此处将 src/href 等属性中的绝对 URL（指向 /api/v1/files/）统一还原为相对路径
    const originalLength = resultHtml.length;
    // 匹配 src="https?://任意域名/api/v1/files/..." 或 src='...' 或 url(...) 等引用
    // 使用全局替换，将所有绝对路径 /api/v1/files/xxxx 还原为 /api/v1/files/xxxx
    resultHtml = resultHtml.replace(
        // 匹配两种 URL 引用格式：
        // 1. HTML 属性：src="https://..." 或 href='https://...'
        // 2. CSS 函数：url("https://...") 或 url('https://...')
        /((?:src|href)\s*=\s*["']|url\s*\(\s*["'])https?:\/\/[^\/]+\/api\/v1\/files\//gi,
        (match) => {
            // 保留属性名/函数名 + 路径部分，去掉协议和主机名
            return match.replace(/https?:\/\/[^\/]+\/api\/v1\/files\//i, "/api/v1/files/");
        }
    );
    if (resultHtml.length !== originalLength) {
        console.log("[htmlppt] 检测到绝对 URL 已规范化：原始 " + originalLength + " 字符 → " + resultHtml.length + " 字符");
    }

    // ========== 成功：返回 HTML 代码 ==========
    console.log("[htmlppt] HTML PPT 生成成功，HTML 长度：" + resultHtml.length + " 字符。");
    return {
        code: 200,
        html: resultHtml
    };
}

module.exports = { generateHtmlPpt: main };
