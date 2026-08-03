// ==================== 模型成本计算模块 ====================
// 职责：按成本配置（config/model_cost_config.json）计算每次调用的成本单价/分项/总额
// 与售价计算（utils/billing.js）共用时段匹配与取整工具（utils/billing_config.js）
// 成本配置缺失某模型时返回 null，由调用方回退为按售价计算并告警

const path = require("path");
const { loadConfig, getActivePeriodFromConfig, getPriceFromPeriod, ceilTo7Decimals } = require("./billing_config");

// ==================== 成本配置路径 ====================
const COST_CONFIG_PATH = path.join(__dirname, "..", "config", "model_cost_config.json");

// 日志前缀
const TAG = "[billing_cost]";

/**
 * 实时读取成本配置（config/model_cost_config.json）
 * @returns {Object|null} 成本配置对象，读取失败返回 null
 */
function loadCostConfig() {
  const config = loadConfig(COST_CONFIG_PATH);
  if (!config) {
    console.error(TAG + " 成本配置不可用: " + COST_CONFIG_PATH);
  }
  return config;
}

/**
 * 按当前时段获取指定 provider+model 的成本单价
 * @param {string} provider - 提供商名称
 * @param {string} model - 模型名称
 * @returns {Object|null} 成本单价对象（结构与售价配置一致）
 */
function getCostPrice(provider, model) {
  const config = loadCostConfig();
  if (!config) return null;
  const period = getActivePeriodFromConfig(config);
  if (!period) return null;
  return getPriceFromPeriod(period, provider, model);
}

/**
 * 计算 LLM Token 调用的成本（价格单位为 元/百万tokens，需除以 1,000,000）
 * @param {string} provider - 提供商名称
 * @param {string} model - 模型名称
 * @param {number} cacheHitTokens - 缓存命中 token 数
 * @param {number} cacheMissTokens - 缓存未命中 token 数
 * @param {number} completionTokens - 输出 token 数
 * @returns {Object|null} { inputUnitPrice, cacheHitUnitPrice, outputUnitPrice, inputCost, outputCost, totalCost }；成本配置缺失返回 null
 */
function computeTokenCost(provider, model, cacheHitTokens, cacheMissTokens, completionTokens) {
  const price = getCostPrice(provider, model);
  if (!price) return null;

  const hitTokens = cacheHitTokens || 0;
  const missTokens = cacheMissTokens || 0;
  const outTokens = completionTokens || 0;

  const inputCost = ceilTo7Decimals(
    (hitTokens / 1000000) * (price.input_cache_hit || 0)
    + (missTokens / 1000000) * (price.input_cache_miss || 0)
  );
  const outputCost = ceilTo7Decimals((outTokens / 1000000) * (price.output || 0));
  const totalCost = ceilTo7Decimals(inputCost + outputCost);

  return {
    inputUnitPrice: price.input_cache_miss || null,
    cacheHitUnitPrice: price.input_cache_hit || null,
    outputUnitPrice: price.output || null,
    inputCost,
    outputCost,
    totalCost,
  };
}

/**
 * 计算外部调用（文生图 / TTS / doc2x）的成本
 * @param {string} provider - 提供商名称
 * @param {string} model - 模型名称
 * @param {string} callTag - 调用标签（create_image / tts / doc2x）
 * @param {Object} quantities - { imageCount, textLength, pageCount } 按调用类型取用对应数量
 * @returns {Object|null} { unitPrice, totalCost }；成本配置缺失或 callTag 未知返回 null
 */
function computeExternalCost(provider, model, callTag, quantities) {
  const price = getCostPrice(provider, model);
  if (!price) return null;

  const { imageCount, textLength, pageCount } = quantities || {};
  let unitPrice = 0;
  let totalCost = 0;

  if (callTag === "create_image") {
    // 文生图：按张数计费
    unitPrice = price.per_image || 0;
    totalCost = ceilTo7Decimals((imageCount || 1) * unitPrice);
  } else if (callTag === "doc2x") {
    // doc2x PDF解析：按页计费
    unitPrice = price.per_page || 0;
    totalCost = ceilTo7Decimals((pageCount || 0) * unitPrice);
  } else if (callTag === "tts") {
    // TTS：按字符数计费
    unitPrice = price.per_char || 0;
    totalCost = ceilTo7Decimals((textLength || 0) * unitPrice);
  } else {
    console.warn(TAG + " 未知的 callTag: " + callTag + "，无法计算成本。");
    return null;
  }

  return { unitPrice, totalCost };
}

// ==================== 模块导出 ====================
module.exports = { computeTokenCost, computeExternalCost, loadCostConfig };
