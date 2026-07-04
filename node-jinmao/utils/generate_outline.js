// 该模块负责调用 DeepSeek 生成 PPT 大纲，仅返回 JSON 内容，不负责文件持久化
// 返回值格式：{ code: number, outline?: object, message?: string }
//   code 200 — 成功生成大纲，outline 包含解析后的 JSON 对象
//   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限等）
//   code 500 — DeepSeek API 调用失败（网络错误、服务端错误等）
//   code 502 — DeepSeek 返回内容不是合法 JSON，解析失败
// Please install OpenAI SDK first: `npm install openai`

const OpenAI = require("openai");
const { deepseek: config } = require("../config");
const prompt = require("../config/prompt.json");
const fs = require("fs");
const path = require("path");
const { validateFields } = require("./input_validator");

// 初始化OpenAI客户端
const openai = new OpenAI({
        baseURL: config.DEEPSEEK_API_BIG.DEEPSEEK_API_BASE,
        apiKey: config.DEEPSEEK_API_BIG.DEEPSEEK_API_KEY,
});

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
 * @param {string} yuanwen - 原文内容，用于生成大纲
 * @param {string} pptother - 文章标题 / PPT 其他信息
 * @returns {{ code: number, outline?: object, message?: string }}
 *   始终返回对象，不会抛出异常。调用方根据 code 判断结果：
 *   - code 200 时 outline 有值，可直接使用
 *   - code ≥ 400 时 outline 为 undefined，通过 message 了解失败原因
 */
async function main(yuanwen, pptother) {
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
  console.log("[main] Prompt 模板已加载并替换占位符，准备调用 DeepSeek API。");

  // ========== 调用 DeepSeek API 生成大纲 ==========
  let completion;
  try {
    completion = await openai.chat.completions.create({
      messages: [{ role: "system", content: formattedPrompt }],// 系统提示词
      model: config.DEEPSEEK_API_BIG.DEEPSEEK_API_MODEL,// 模型名称
      thinking: {"type": "enabled"},//思考模式
      response_format: {"type": "json_object"},//json格式优化
      reasoning_effort: "max",//最大思考努力
      stream: false,
    });
  } catch (apiError) {
    // 捕获 API 调用层面的所有错误（网络超时、鉴权失败、服务端 5xx 等）
    console.error("[main] DeepSeek API 调用失败：" + apiError.message);
    return {
      code: 500,
      message: "DeepSeek API 调用失败：" + apiError.message
    };
  }

  // ========== 校验 API 返回结构的完整性 ==========
  // 确保 choices 数组存在且不为空
  if (!completion || !completion.choices || completion.choices.length === 0) {
    console.error("[main] DeepSeek API 返回内容为空或缺少 choices 字段。");
    return {
      code: 500,
      message: "DeepSeek API 返回内容为空，未能获取有效的大纲数据。"
    };
  }

  // ========== 解析 DeepSeek 返回的 JSON 大纲 ==========
  const resultText = completion.choices[0].message.content;
  console.log("[main] DeepSeek API 调用成功，返回内容长度：" + resultText.length + " 字符。");

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

  // ========== 成功：返回大纲数据 ==========
  console.log("[main] 大纲生成成功，已解析为 JSON 对象。");
  return {
    code: 200,
    outline: outline
  };
}

module.exports = { generateOutline: main };