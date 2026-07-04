// config/index.js — 统一配置加载入口
// 职责：读取各 JSON 配置文件中的非敏感字段，并用 process.env 中的敏感值覆盖
// 所有业务模块统一通过 require("../config") 获取完整配置，不再直接读取 JSON 文件
//
// 设计说明：
//   - 敏感字段（API Key 等）仅在运行时从 process.env 读取，模块加载时不冻结值
//     这确保了 dotenv 在 app.js 顶部加载后，所有后续 require 的模块能正确获取环境变量
//   - 非敏感字段（model 名称、base URL、speaker 等）保留在 config/*.json 中便于维护

// ==================== 加载非敏感 JSON 配置 ====================
// deepseek_config.json：不含 API_KEY，只保留 BASE 和 MODEL
const deepseekConfig = require("./deepseek_config.json");

// doc2x_config.json：不含 API_KEY，只保留 BASE
const doc2xConfig = require("./doc2x_config.json");

// volcengine_config.json：不含 APP_ID 和 ACCESS_KEY，只保留其余字段
const volcengineConfig = require("./volcengine_config.json");

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

console.log("[config/index] 统一配置加载完成。");
console.log("[config/index] DeepSeek API_KEY 已注入: " + (process.env.DEEPSEEK_API_KEY ? "是 (长度 " + process.env.DEEPSEEK_API_KEY.length + ")" : "否"));
console.log("[config/index] Doc2x API_KEY 已注入: " + (process.env.DOC2X_API_KEY ? "是" : "否"));
console.log("[config/index] 火山引擎 APP_ID 已注入: " + (process.env.VOLCENGINE_TTS_APP_ID ? "是" : "否 (空值)"));
console.log("[config/index] 火山引擎 ACCESS_KEY 已注入: " + (process.env.VOLCENGINE_TTS_ACCESS_KEY ? "是" : "否 (空值)"));

// ==================== 导出统一配置对象 ====================
module.exports = {
    deepseek: deepseekConfig,       // { DEEPSEEK_API_BIG: {...}, DEEPSEEK_API_SMALL: {...} }
    doc2x: doc2xConfig,             // { DOC2X_API_KEY: "...", DOC2X_API_BASE: "..." }
    volcengine: volcengineConfig,   // { VOLCENGINE_TTS: { APP_ID, ACCESS_KEY, RESOURCE_ID, SPEAKER, API_URL } }
};
