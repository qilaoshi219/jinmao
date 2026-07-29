// ==================== 标题生成模块 ====================
// 调用 DeepSeek 小模型（deepseek-v4-flash）为教材内容生成标题和副标题
// 输入：用户ID（userId）、文件名（filename）、原文内容（content）
// 输出：标题和副标题 JSON，交由调用者进行后续处理和落盘
// 计费：通过 llm_client 统一管理，自动记录 token 费用到 billing_record 表
//
// 返回值格式：{ code: number, title?: string, subtitle?: string, message?: string }
//   code 200 — 成功生成标题，title 和 subtitle 包含生成的内容
//   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限等）
//   code 500 — DeepSeek API 调用失败（网络错误、鉴权失败、服务端错误等）
//   code 502 — DeepSeek 返回内容不是合法 JSON，解析失败
//   code 503 — DeepSeek 返回 JSON 不包含 title 或 subtitle 字段

const llmClient = require("./llm_client");
const prompt = require("../config/prompt.json");
const fs = require("fs");
const path = require("path");
const { validateFields } = require("./input_validator");

/**
 * 调用 DeepSeek 小模型为教材内容生成标题和副标题（仅返回数据，不负责文件持久化）
 *
 * 返回值格式：{ code: number, title?: string, subtitle?: string, message?: string }
 *
 * 状态码说明：
 *   code 200 — 成功生成标题，title 和 subtitle 包含生成的内容
 *   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限等）
 *   code 500 — DeepSeek API 调用失败（网络错误、服务端错误、API 返回异常等）
 *   code 502 — DeepSeek 返回内容不是合法 JSON，解析失败
 *   code 503 — DeepSeek 返回 JSON 不包含 title 或 subtitle 字段
 *
 * @param {string} userId - 用户 ID（用于计费关联）
 * @param {string} filename - 文件名，用于提示词上下文
 * @param {string} content - 教材原文内容（纯文本）
 * @returns {Promise<{ code: number, title?: string, subtitle?: string, message?: string }>}
 *   始终返回对象，不会抛出异常。调用方根据 code 判断结果：
 *   - code 200 时 title 和 subtitle 有值，可直接使用
 *   - code ≥ 400 时 title 和 subtitle 为 undefined，通过 message 了解失败原因
 */
async function createTitle(userId, filename, content) {
    const TAG = "[create_title]";

    // ========== 前置输入验证：使用公共验证模块拦截非法输入 ==========
    const validationResult = validateFields({
        filename: {
            value: filename,
            type: "string",
            options: { maxLength: 500, required: true }
        },
        content: {
            value: content,
            type: "string",
            options: { maxLength: 100000, required: true }
        }
    }, TAG);
    if (!validationResult.valid) {
        console.error(TAG + " 输入验证未通过（code=" + validationResult.errorCode + "），拒绝执行：" + validationResult.error);
        return {
            code: validationResult.errorCode,
            message: validationResult.error
        };
    }
    console.log(TAG + " 输入验证通过，开始执行标题生成流程。");

    // ========== 读取 Prompt 模板并替换占位符 ==========
    console.log(TAG + " 正在加载提示词模板：" + prompt.title_prompt);
    const titlePromptPath = path.resolve(__dirname, prompt.title_prompt);
    let titlePrompt;
    try {
        titlePrompt = fs.readFileSync(titlePromptPath, "utf8");
    } catch (readError) {
        console.error(TAG + " 读取提示词模板失败：" + readError.message);
        return { code: 500, message: "读取标题生成提示词模板失败：" + readError.message };
    }

    // 替换 prompt 模板中的占位符：{{filename}}、{{content}}
    let formattedPrompt = titlePrompt.replace("{{filename}}", filename);
    formattedPrompt = formattedPrompt.replace("{{content}}", content);
    console.log(TAG + " 提示词模板已加载并替换占位符，准备调用 DeepSeek API（小模型）。");

    // ========== 通过统一 llm_client 调用 DeepSeek API（自动计费） ==========
    const chatResult = await llmClient.chat(userId, "title", {
        modelSize: "small",
        messages: [{ role: "system", content: formattedPrompt }],
        response_format: { type: "json_object" },
        stream: false,
    });

    // ========== 处理 API 调用结果 ==========
    if (chatResult.code !== 200) {
        console.error(TAG + " DeepSeek API 调用失败：" + chatResult.message);
        return {
            code: chatResult.code,
            message: "DeepSeek API 调用失败：" + chatResult.message
        };
    }

    // ========== 解析 DeepSeek 返回的 JSON ==========
    const resultText = chatResult.message.content;
    console.log(TAG + " DeepSeek API 调用成功，返回内容长度：" + resultText.length + " 字符。");

    let result;
    try {
        result = JSON.parse(resultText);
    } catch (parseError) {
        // 解析失败 —— 可能 API 返回了非 JSON 格式的内容
        console.error(TAG + " API 返回内容 JSON 解析失败：" + parseError.message);
        return {
            code: 502,
            message: "DeepSeek 返回的内容不是合法的 JSON 格式，解析失败：" + parseError.message
        };
    }

    // ========== 校验返回 JSON 是否包含必要字段 ==========
    if (!result.title || typeof result.title !== "string") {
        console.error(TAG + " API 返回 JSON 不包含有效的 title 字段。");
        return {
            code: 503,
            message: "DeepSeek 返回的 JSON 不包含 title 字段或 title 不是字符串类型。"
        };
    }
    if (!result.subtitle || typeof result.subtitle !== "string") {
        console.error(TAG + " API 返回 JSON 不包含有效的 subtitle 字段。");
        return {
            code: 503,
            message: "DeepSeek 返回的 JSON 不包含 subtitle 字段或 subtitle 不是字符串类型。"
        };
    }

    // ========== 成功：返回标题和副标题 ==========
    console.log(TAG + " 标题生成成功！");
    console.log(TAG + " 生成的标题：" + result.title);
    console.log(TAG + " 生成的副标题：" + result.subtitle);
    return {
        code: 200,
        title: result.title,
        subtitle: result.subtitle
    };
}

// ==================== 模块导出 ====================
module.exports = { createTitle };
