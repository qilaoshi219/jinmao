// config/index.js — 统一配置加载入口
// 职责：读取各 JSON 配置文件中的非敏感字段，并用 process.env 中的敏感值覆盖
// 所有业务模块统一通过 require("../config") 获取完整配置，不再直接读取 JSON 文件
//
// 设计说明：
//   - 敏感字段（API Key 等）仅在运行时从 process.env 读取，模块加载时不冻结值
//   - 在模块顶部主动加载 dotenv，确保无论通过 app.js、node -e 还是其他方式引入，
//     都能正确读取 .env 文件中的环境变量
//   - 非敏感字段（model 名称、base URL、speaker 等）保留在 config/*.json 中便于维护
const path = require("path");

// 在模块顶部主动加载 dotenv，确保 process.env 包含 .env 中的所有值
// 无论通过 app.js 还是 node -e 等方式引入此模块，都能正确获取环境变量
try {
  require("dotenv").config({
    path: path.resolve(__dirname, "..", ".env"), // 指向项目根目录的 .env 文件
    override: true, // .env 文件为权威配置源，覆盖任何已注入的同名环境变量
  });
} catch (e) {
  // dotenv 可能未安装，但 app.js 中已安装，这里做防御处理
  console.warn("[config/index] 警告：dotenv 模块未找到，请确保已运行 npm install。");
}

// ==================== 加载非敏感 JSON 配置 ====================
// deepseek_config.json：不含 API_KEY，只保留 BASE 和 MODEL
const deepseekConfig = require("./deepseek_config.json");

// doc2x_config.json：不含 API_KEY，只保留 BASE
const doc2xConfig = require("./doc2x_config.json");

// volcengine_config.json：不含 APP_ID 和 ACCESS_KEY，只保留其余字段
const volcengineConfig = require("./volcengine_config.json");

// grsai_config.json：不含 API_KEY，只保留 BASE、MODEL、轮询参数等
const grsaiConfig = require("./grsai_config.json");

// billing_pricing.json：计费价格配置（不含敏感信息，可独立修改）
const billingPricingConfig = require("./billing_pricing.json");

// ==================== 注入敏感字段（从 process.env 读取） ====================
// 注意：这里的赋值在每个模块首次 require("../config") 时执行一次
// 由于 dotenv 已在 app.js 顶部加载，此时 process.env 已包含 .env 中的所有值

// DeepSeek：两个模型共用同一个 API_KEY
deepseekConfig.DEEPSEEK_API_BIG.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
deepseekConfig.DEEPSEEK_API_SMALL.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Doc2x
doc2xConfig.DOC2X_API_KEY = process.env.DOC2X_API_KEY;

// 火山引擎 TTS
volcengineConfig.VOLCENGINE_TTS.APP_ID = process.env.VOLCENGINE_TTS_APP_ID;
volcengineConfig.VOLCENGINE_TTS.ACCESS_KEY = process.env.VOLCENGINE_TTS_ACCESS_KEY;

// Grsai 文生图 API
grsaiConfig.GRSAI_API_KEY = process.env.GRSAI_API_KEY;

// ==================== API Key 格式校验 ====================
// HTTP 头部（如 Authorization: Bearer <key>）仅允许 ASCII 字符，
// 若 API Key 包含中文等非 ASCII 字符，会导致 undici/HTTP 库抛出 ByteString 异常
// 此处提前校验，给出明确的错误提示，方便开发人员快速定位问题

/**
 * 校验 API Key 是否合法（非空 + 全 ASCII 字符）
 * @param {string} key - API Key 值
 * @param {string} keyName - 字段名（用于错误提示，如 "DEEPSEEK_API_KEY"）
 * @returns {{ valid: boolean, error?: string }} 校验结果
 */
function validateApiKey(key, keyName) {
  if (!key || key.length === 0) {
    return { valid: false, error: keyName + " 未配置，请在 .env 文件中填写正确的值。" };
  }
  // 逐个字符检查是否为 ASCII（charCode < 128）
  for (let i = 0; i < key.length; i++) {
    const charCode = key.charCodeAt(i);
    if (charCode > 127) {
      return {
        valid: false,
        error: keyName + " 中包含非 ASCII 字符（位于索引 " + i + "，Unicode: " + charCode + "，字符: '" + key[i] + "'），"
          + "请检查 .env 文件中的值是否已替换为真实的 API Key，而非中文占位文本。"
      };
    }
  }
  return { valid: true };
}

// 逐一校验各 API Key
const keyChecks = [
  { key: process.env.DEEPSEEK_API_KEY, name: "DEEPSEEK_API_KEY" },
  { key: process.env.DOC2X_API_KEY, name: "DOC2X_API_KEY" },
  { key: process.env.VOLCENGINE_TTS_APP_ID, name: "VOLCENGINE_TTS_APP_ID" },
  { key: process.env.VOLCENGINE_TTS_ACCESS_KEY, name: "VOLCENGINE_TTS_ACCESS_KEY" },
  { key: process.env.GRSAI_API_KEY, name: "GRSAI_API_KEY" },
];
let keyCheckFailed = false;
keyChecks.forEach(({ key, name }) => {
  if (key) {
    const result = validateApiKey(key, name);
    if (!result.valid) {
      console.error("[config/index] ❌ API Key 校验失败: " + result.error);
      keyCheckFailed = true;
    }
  }
});
if (!keyCheckFailed) {
  console.log("[config/index] 所有 API Key 格式校验通过。");
}

console.log("[config/index] 统一配置加载完成。");
console.log("[config/index] DeepSeek API_KEY 已注入: " + (process.env.DEEPSEEK_API_KEY ? "是 (长度 " + process.env.DEEPSEEK_API_KEY.length + ")" : "否"));
console.log("[config/index] Doc2x API_KEY 已注入: " + (process.env.DOC2X_API_KEY ? "是" : "否"));
console.log("[config/index] 火山引擎 APP_ID 已注入: " + (process.env.VOLCENGINE_TTS_APP_ID ? "是" : "否 (空值)"));
console.log("[config/index] 火山引擎 ACCESS_KEY 已注入: " + (process.env.VOLCENGINE_TTS_ACCESS_KEY ? "是" : "否 (空值)"));
console.log("[config/index] Grsai API_KEY 已注入: " + (process.env.GRSAI_API_KEY ? "是 (长度 " + process.env.GRSAI_API_KEY.length + ")" : "否"));

// ==================== DeepSeek API 超时配置 ====================
// 大模型（deepseek-v4-pro + thinking enabled）：15 分钟超时
//   - 思考模式下推理耗时较长，DeepSeek 官方文档说明 10 分钟未开始推理才断开
//   - 此处设为 15 分钟，给推理 + 输出留足时间
// 小模型（deepseek-v4-flash）：5 分钟超时
//   - 小模型速度快（通常 <30 秒），5 分钟为极端情况下的兜底保护
const DEEPSEEK_TIMEOUT = {
    BIG_MODEL: 15 * 60 * 1000,      // 大模型（pro）：15 分钟
    SMALL_MODEL: 5 * 60 * 1000,     // 小模型（flash）：5 分钟
};

console.log("[config/index] DeepSeek API 超时配置已加载: BIG_MODEL=" + (DEEPSEEK_TIMEOUT.BIG_MODEL / 1000) + "s, SMALL_MODEL=" + (DEEPSEEK_TIMEOUT.SMALL_MODEL / 1000) + "s");

// ==================== 导出统一配置对象 ====================
module.exports = {
    deepseek: deepseekConfig,       // { DEEPSEEK_API_BIG: {...}, DEEPSEEK_API_SMALL: {...} }
    doc2x: doc2xConfig,             // { DOC2X_API_KEY: "...", DOC2X_API_BASE: "..." }
    volcengine: volcengineConfig,   // { VOLCENGINE_TTS: { APP_ID, ACCESS_KEY, RESOURCE_ID, SPEAKER, API_URL } }
    grsai: grsaiConfig,             // { GRSAI_API_KEY, GRSAI_API_BASE, GRSAI_MODEL, ... }
    DEEPSEEK_TIMEOUT: DEEPSEEK_TIMEOUT, // { BIG_MODEL: 900000, SMALL_MODEL: 300000 }
    billing: billingPricingConfig,     // 计费价格配置（从 billing_pricing.json 加载）
    validateApiKey,                     // API Key 格式校验（非空 + 全 ASCII），供管理端 env 路由复用
};
