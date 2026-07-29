// 该模块负责调用 DeepSeek 生成 PPT 大纲，仅返回 JSON 内容，不负责文件持久化
// 通过统一的 llm_client 模块调用 DeepSeek API，自动处理客户端管理、心跳、看门狗和计费
// 返回值格式：{ code: number, outline?: object, message?: string }
//   code 200 — 成功生成大纲，outline 包含解析后的 JSON 对象
//   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限等）
//   code 500 — DeepSeek API 调用失败（网络错误、服务端错误等）
//   code 502 — DeepSeek 返回内容不是合法 JSON，解析失败

const llmClient = require("./llm_client");  // 统一 LLM 客户端（自动处理客户端管理、心跳、看门狗、计费）
const prompt = require("../config/prompt.json");
const fs = require("fs");
const path = require("path");
const { validateFields } = require("./input_validator");

// validateInput 已迁移至公共验证模块 input_validator.js，通过 validateFields 统一调用

/**
 * 调用 DeepSeek 生成 PPT 大纲（仅返回数据，不负责文件持久化）
 * 
 * 返回值格式：{ code: number, outline?: object, message?: string }
 * 
 * 状态码说明：
 *   code 200 — 成功生成大纲，outline 包含解析后的 JSON 对象
 *   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限等）
 *   code 500 — DeepSeek API 调用失败（网络错误、服务端错误、API 返回异常等）
 *   code 502 — DeepSeek 返回内容不是合法 JSON，解析失败
 * 
 * @param {string} userId - 用户 ID（用于 llm_client 计费关联）
 * @param {string} yuanwen - 原文内容，用于生成大纲
 * @param {string} pptother - 文章标题 / PPT 其他信息
 * @returns {Promise<{ code: number, outline?: object, message?: string }>}
 *   始终返回对象，不会抛出异常。调用方根据 code 判断结果：
 *   - code 200 时 outline 有值，可直接使用
 *   - code ≥ 400 时 outline 为 undefined，通过 message 了解失败原因
 */
async function main(userId, yuanwen, pptother) {
  // ========== 前置输入验证：使用公共验证模块拦截非法输入 ==========
  const validationResult = validateFields({
    yuanwen: {
      value: yuanwen,
      type: "string",
      options: { maxLength: 50000, required: true }
    },
    pptother: {
      value: pptother,
      type: "string",
      options: { maxLength: 500, required: true }
    }
  }, "[generate_outline]");
  if (!validationResult.valid) {
    console.error("[main] 输入验证未通过（code=" + validationResult.errorCode + "），拒绝执行：" + validationResult.error);
    return {
      code: validationResult.errorCode,
      message: validationResult.error
    };
  }
  console.log("[main] 输入验证通过，开始执行大纲生成流程。");

  // ========== 读取 Prompt 模板并替换占位符 ==========
  const outlinePromptPath = path.resolve(__dirname, prompt.outline_prompt);
  const outlinePrompt = fs.readFileSync(outlinePromptPath, "utf8");
  // 替换prompt模板中的{{yuanwen}}和{{pptother}}占位符
  let formattedPrompt = outlinePrompt.replace("{{yuanwen}}", yuanwen);
  formattedPrompt = formattedPrompt.replace("{{pptother}}", pptother);
  console.log("[main] Prompt 模板已加载并替换占位符，准备通过 llm_client 调用 DeepSeek API。");

  // ========== 通过 llm_client 统一调用 DeepSeek API 生成大纲 ==========
  // llm_client 自动处理：客户端管理、心跳定时器、看门狗、错误处理、计费记录
  const chatResult = await llmClient.chat(userId, "outline", {
    modelSize: "big",
    messages: [{ role: "system", content: formattedPrompt }],
    thinking: { type: "enabled" },
    reasoning_effort: "max",
    stream: false,
  });

  // ========== 检查 llm_client 返回状态 ==========
  if (chatResult.code !== 200) {
    console.error("[main] llm_client 调用失败（code=" + chatResult.code + "）：" + (chatResult.message || "未知错误"));
    return {
      code: 500,
      message: chatResult.message || "DeepSeek API 调用失败"
    };
  }

  // ========== 提取返回的文本内容 ==========
  const resultText = chatResult.message.content;
  console.log("[main] DeepSeek API 调用成功，返回内容长度：" + (resultText ? resultText.length : 0) + " 字符。");

  // ========== 解析 DeepSeek 返回的 JSON 大纲 ==========
  let outline;
  try {
    outline = JSON.parse(resultText);
  } catch (parseError) {
    // 解析失败 —— 可能 API 返回了非 JSON 格式的内容
    console.error("[main] API 返回内容 JSON 解析失败：" + parseError.message);
    return {
      code: 502,
      message: "DeepSeek 返回的内容不是合法的 JSON 格式，解析失败：" + parseError.message
    };
  }

  // ========== 兜底处理：数组 → 对象包装 ==========
  // 原因：prompt 要求输出 JSON 数组 [...]，但 course_pipeline.js 通过 outline.slides 消费
  // 如果模型返回了纯数组（而非 {slides: [...]}），outline.slides 会是 undefined
  // 此处自动检测并包装，确保上下游格式兼容
  if (Array.isArray(outline)) {
    console.log("[main] 检测到返回结果为纯数组，自动包装为 {slides: [...]}，共 " + outline.length + " 张幻灯片");
    outline = { slides: outline };
  }

  // ========== 成功：返回大纲数据 ==========
  const slideCount = outline.slides ? outline.slides.length : 0;
  console.log("[main] 大纲生成成功，共 " + slideCount + " 张幻灯片");
  return {
    code: 200,
    outline: outline
  };
}

module.exports = { generateOutline: main };
