// 该模块负责调用 DeepSeek 大模型对原始口播稿进行扩写细化，仅返回 JSON 内容，不负责文件持久化
// 输入：原始口播稿(elaboration)、教材原文(original)、预期字数(expectedWords)、页码索引(slideIndex)
// slideIndex 为 0-based 页索引：0 表示第一页（使用 elaboration_prompt_first 提示词），>0 表示其他页
// 提示词从 config/prompt.json 的 elaboration_prompt / elaboration_prompt_first 字段指定的文件中加载
// 占位符替换：{{elaboration}}→原始口播稿、{{original}}→教材原文、{{expected_words}}→预期字数
// DeepSeek 返回 JSON 格式：{"script": "扩写后的口播稿文本..."}
// 返回值格式：{ code: number, script?: string, message?: string }
//   code 200 — 成功扩写，script 包含扩写后的口播稿文本
//   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限等）
//   code 500 — DeepSeek API 调用失败（网络错误、服务端错误等）
//   code 502 — DeepSeek 返回内容不是合法 JSON，解析失败
//   code 503 — DeepSeek 返回 JSON 不包含 script 字段
// Please install OpenAI SDK first: `npm install openai`

const prompt = require("../config/prompt.json");
const fs = require("fs");
const path = require("path");
const { validateFields } = require("./input_validator");
const llmClient = require("./llm_client"); // 统一 LLM 客户端（替代原先直连 DeepSeek API）

// validateInput 已迁移至公共验证模块 input_validator.js，通过 validateFields 统一调用

/**
 * 调用 DeepSeek 大模型对口播稿进行扩写细化（仅返回数据，不负责文件持久化）
 * 底层通过统一 LLM 客户端（llm_client）调用，自动处理心跳、看门狗、计费
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
 * @param {string} userId - 用户 ID（传递给 llm_client 用于计费关联）
 * @param {string} elaboration - 原始口播稿内容
 * @param {string} original - 教材原文内容
 * @param {number|string} expectedWords - 预期字数
 * @param {number} [slideIndex=-1] - 页码索引（0-based），0 表示第一页使用专用提示词，-1 表示不区分
 * @returns {Promise<{ code: number, script?: string, message?: string }>}
 *   始终返回对象，不会抛出异常。调用方根据 code 判断结果：
 *   - code 200 时 script 有值，可直接使用
 *   - code ≥ 400 时 script 为 undefined，通过 message 了解失败原因
 */
async function main(userId, elaboration, original, expectedWords, slideIndex = -1) {
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

    // ========== 根据页码选择提示词模板 ==========
    // 第一页（slideIndex === 0）使用专用的简练提示词，其他页使用通用提示词
    const isFirstSlide = (slideIndex === 0);
    const promptKey = isFirstSlide ? "elaboration_prompt_first" : "elaboration_prompt";
    console.log("[elaboration][main] 页码：" + (slideIndex >= 0 ? "第" + (slideIndex + 1) + "页" : "未知") +
      " → 使用提示词模板：" + promptKey);

    // ========== 读取 Prompt 模板并替换占位符 ==========
    console.log("[elaboration][main] 正在加载提示词模板：" + prompt[promptKey]);
    const elaborationPromptPath = path.resolve(__dirname, prompt[promptKey]);
    const elaborationPrompt = fs.readFileSync(elaborationPromptPath, "utf8");
    // 替换prompt模板中的三个占位符：{{elaboration}}、{{original}}、{{expected_words}}
    let formattedPrompt = elaborationPrompt.replace("{{elaboration}}", elaboration);
    formattedPrompt = formattedPrompt.replace("{{original}}", original);
    formattedPrompt = formattedPrompt.replace("{{expected_words}}", String(parsedWords));
    console.log("[elaboration][main] 提示词模板已加载并替换占位符，准备通过 llm_client 调用 DeepSeek API。");

    // ========== 通过统一 LLM 客户端调用 DeepSeek API ==========
    // llm_client 已内置心跳、看门狗、计费功能，无需在此重复实现
    const chatResult = await llmClient.chat(userId, "elaboration", {
        modelSize: "small",
        messages: [{ role: "system", content: formattedPrompt }],
        thinking: { type: "enabled" },
        response_format: { type: "json_object" },
        reasoning_effort: "max",
        stream: false,
    });

    // 检查 llm_client 返回状态码
    if (chatResult.code !== 200) {
        console.error("[elaboration][main] llm_client 调用失败（code=" + chatResult.code + "）：" + (chatResult.message || "未知错误"));
        return {
            code: 500,
            message: "DeepSeek API 调用失败：" + (chatResult.message || "未知错误")
        };
    }

    // ========== 从 llm_client 返回结果中提取内容文本 ==========
    const resultText = chatResult.message.content;
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
