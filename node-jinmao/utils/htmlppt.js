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
const { detectDesignGuideContamination, detectOverflowViolation } = require("./htmlppt_guard"); // 生成后规范校验：设计说明污染 + 16:9 画布/滚动条违规

// 自动重试时给 LLM 的纠正指令（多轮消息中的最后一轮）
const CONTAMINATION_CORRECTION = "纠正：你上一次的输出把\"设计说明/设计意图\"类文字混入了幻灯片正文（如：视觉亮点与设计意图、色彩与氛围、叙事性布局、字体与可读性等）。幻灯片正文必须只包含真实的教材教学内容，不得出现任何设计说明、设计复盘、Markdown 标记（###、**、```）。请删除这些内容，仅保留教学内容，重新输出完整的 HTML 幻灯片。";
const OVERFLOW_CORRECTION = "纠正：你上一次输出的幻灯片违反了画布规范：html/body 必须设置 overflow: hidden；所有内容（含绝对定位元素、图片、长文本）必须完整容纳在 1920×1080（16:9）画布内，严禁超出画布边界；任何元素严禁出现滚动条或设置 overflow: auto/scroll（含 overflow-x/overflow-y）。请修正布局与样式后，重新输出完整的 HTML 幻灯片。";

/**
 * 对生成的 HTML 同时执行设计说明污染检测与画布溢出检测
 * @param {string} html - 待检测的 HTML
 * @returns {{ violated: boolean, reasons: string[], contamination: object, overflow: object }}
 *   violated — 是否命中任一违规；reasons — 全部命中原因；contamination/overflow — 两项检测的原始结果
 */
function checkSlideViolations(html) {
    const contamination = detectDesignGuideContamination(html);
    const overflow = detectOverflowViolation(html);
    const reasons = [
        ...(contamination.contaminated ? contamination.reasons : []),
        ...(overflow.violated ? overflow.reasons : []),
    ];
    return { violated: reasons.length > 0, reasons, contamination, overflow };
}

/**
 * 根据命中的违规类型组装纠正指令（仅包含实际命中的部分）
 * @param {{ contamination: object, overflow: object }} violations - checkSlideViolations 的返回结果
 * @returns {string} 拼接后的纠正指令文本
 */
function buildCorrectionText(violations) {
    const corrections = [];
    if (violations.contamination.contaminated) {
        corrections.push(CONTAMINATION_CORRECTION);
    }
    if (violations.overflow.violated) {
        corrections.push(OVERFLOW_CORRECTION);
    }
    return corrections.join("\n");
}

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

    // 清理 + 校验（markdown 包裹剥离 / HTML 主体截取 / 标记校验 / URL 规范化）
    let cleanResult = cleanAndValidateHtml(resultHtml);
    if (cleanResult.code !== 200) {
        return { code: cleanResult.code, message: cleanResult.message };
    }
    resultHtml = cleanResult.html;

    // ========== 生成结果规范校验（设计说明污染 + 画布/滚动条违规）+ 自动重试（最多 1 次） ==========
    // 背景：LLM 偶发会在正文末尾自创追加"设计说明/设计复盘"段落（如 ``` ### 视觉亮点与设计意图 ... ```），
    //       或生成超出 16:9 画布、带滚动条的布局；前端 iframe 原样渲染后用户会看到多余文字或滚动条。
    //       此处任一违规命中后，携带对应纠正指令自动重新生成一次（会产生额外一次模型调用计费，日志明示）。
    let violations = checkSlideViolations(resultHtml);
    if (violations.violated) {
        console.warn("[htmlppt] 检测到生成结果违规，命中原因: " + JSON.stringify(violations.reasons) +
            "，触发自动重试（将额外产生一次模型调用计费）。");

        // 多轮消息：系统提示词 + 原始任务 + 本次违规输出 + 纠正指令（仅包含命中的违规类型）
        const retryMessages = [
            { role: "system", content: formattedPrompt },
            { role: "user", content: "请根据 PPT 生成指引与教材原文，生成单页静态 HTML 幻灯片。" },
            { role: "assistant", content: resultHtml },
            { role: "user", content: buildCorrectionText(violations) },
        ];
        const retryResult = await llmClient.chat(userId, "htmlppt", {
            modelSize: "big",
            messages: retryMessages,
            stream: false,
        });

        if (retryResult.code === 200 && retryResult.message && retryResult.message.content) {
            const retryClean = cleanAndValidateHtml(retryResult.message.content);
            if (retryClean.code === 200) {
                resultHtml = retryClean.html;
                violations = checkSlideViolations(resultHtml);
                console.log("[htmlppt] 自动重试完成：仍违规=" + violations.violated +
                    (violations.violated ? "，命中原因: " + JSON.stringify(violations.reasons) : ""));
            } else {
                // 重试输出无法通过清理校验（空内容/非 HTML），保留首次结果并告警
                console.error("[htmlppt] 自动重试返回的内容清理失败（code=" + retryClean.code + "），保留首次结果");
                violations = { violated: true, reasons: ["自动重试输出无效（code=" + retryClean.code + "）"] };
            }
        } else {
            console.error("[htmlppt] 自动重试调用失败：" + (retryResult.message || "未知错误") + "，保留首次结果");
            violations = { violated: true, reasons: ["自动重试调用失败"] };
        }

        // 重试后仍违规：保留结果返回 200（不中断流水线），附严重告警供排查
        if (violations.violated) {
            console.error("[htmlppt] 严重告警：最终输出仍违反生成规范（命中原因: " +
                JSON.stringify(violations.reasons) + "），该页将保留异常内容，建议后续重新生成该页");
            return {
                code: 200,
                html: resultHtml,
                message: "生成完成（警告：输出仍违反生成规范，命中原因: " + JSON.stringify(violations.reasons) + "）"
            };
        }
    }

    // ========== 成功：返回 HTML 代码 ==========
    console.log("[htmlppt] HTML PPT 生成成功，HTML 长度：" + resultHtml.length + " 字符。");
    return {
        code: 200,
        html: resultHtml
    };
}

/**
 * 清理并校验 LLM 返回的原始 HTML 内容
 * 依次执行：markdown 代码块包裹剥离 → DOCTYPE/<html>/<body> 主体截取 → 首尾空白去除
 *          → 有效 HTML 标记校验 → URL 规范化（绝对 URL 转相对路径、移除 <base> 标签）
 * 说明：该函数在首次生成与自动重试两个路径中复用，保证清理行为一致。
 *
 * @param {string} rawHtml - LLM 返回的原始内容
 * @returns {{ code: number, html?: string, message?: string }}
 *   code 200 — 清理校验通过，html 为最终可用的 HTML
 *   code 500 — 内容为空
 *   code 502 — 内容不是有效 HTML（缺少必要标记）
 */
function cleanAndValidateHtml(rawHtml) {
    let resultHtml = rawHtml;

    // ========== 检查返回内容是否为空 ==========
    if (!resultHtml || resultHtml.trim() === "") {
        console.error("[htmlppt] API 返回的 HTML 内容为空。");
        return { code: 500, message: "DeepSeek API 返回的 HTML 内容为空。" };
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
    // 如 https://your-domain.com:30080/api/v1/files/...，导致浏览器用错误协议访问。
    // 同时移除 DeepSeek 可能添加的 <base> 标签（导致相对路径被浏览器解析为绝对地址）
    const originalLength = resultHtml.length;

    // Step 1：检测并移除 <base> 标签
    //   如果 HTML 中有 <base href="https://your-domain.com:30080/">，
    //   即使所有 <img src="/api/v1/files/..."> 都是相对路径，
    //   浏览器也会将其解析为 HTTPS 绝对地址 → ERR_SSL_PROTOCOL_ERROR
    resultHtml = resultHtml.replace(
        /<base\s+[^>]*href\s*=\s*["']https?:\/\/[^"']*["'][^>]*>/gi,
        ""
    );

    // Step 2：全局替换所有 http(s)://域名/api/v1/files/ → /api/v1/files/
    resultHtml = resultHtml.replace(
        /https?:\/\/[^\/"'\s>]+\/api\/v1\/files\//gi,
        "/api/v1/files/"
    );

    if (resultHtml.length !== originalLength) {
        console.log("[htmlppt] 检测到绝对 URL 已规范化：原始 " + originalLength + " 字符 → " + resultHtml.length + " 字符");
    }

    return { code: 200, html: resultHtml };
}

module.exports = { generateHtmlPpt: main };
