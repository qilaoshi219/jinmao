// ==================== 计费配置工具模块 ====================
// 职责：JSON 配置读取、时段匹配、取价、金额取整
// 售价配置（billing_pricing.json）与成本配置（model_cost_config.json）共用本模块，
// 保证两套价格使用完全一致的时段匹配与取整规则

const fs = require("fs");

// ==================== 金额向上取整工具函数 ====================

/**
 * 将金额向上取整到 7 位小数（Decimal(18,7)精度）
 * 策略：如果计算值超过 7 位小数，将第 8 位及之后进位到第 7 位
 * 目的：确保平台不会因四舍五入而少收费用
 *
 * @param {number} value - 原始计算金额
 * @returns {number} 向上取整到 7 位小数的金额
 */
function ceilTo7Decimals(value) {
  if (typeof value !== "number" || value === 0) return value;
  // 将数值放大 10^7 倍，向上取整后再缩回
  const multiplier = 10000000; // 10^7
  return Math.ceil(value * multiplier) / multiplier;
}

// ==================== 读取 JSON 配置 ====================

/**
 * 实时读取 JSON 配置文件
 * 每次调用都重新读取，确保修改配置后无需重启服务即可生效
 * @param {string} configPath - 配置文件绝对路径
 * @returns {Object|null} 配置对象，若读取或解析失败返回 null
 */
function loadConfig(configPath) {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("[billing_config][loadConfig] 读取配置文件失败（" + configPath + "）：" + err.message);
    return null;
  }
}

// ==================== 时段匹配 ====================

/**
 * 根据当前时间匹配配置中的计费时段
 * 若 timeBasedPricing.enabled = false，始终返回 "default" 段
 * 若 enabled = true，按 periods 顺序匹配第一个命中的时段
 *
 * 跨天时段（start > end，如 15:00 → 08:00）特殊处理：
 *   当前时间 >= start 或 当前时间 < end → 命中
 *
 * @param {Object} config - 计费配置对象（含 timeBasedPricing）
 * @returns {{ name: string, start: string, end: string, providers: Object } | null}
 */
function getActivePeriodFromConfig(config) {
  const TAG = "[billing_config][getActivePeriodFromConfig]";
  if (!config) {
    console.error(TAG + " 计费配置不可用，无法确定计费时段。");
    return null;
  }

  const timeConfig = config.timeBasedPricing;
  if (!timeConfig || !timeConfig.periods || timeConfig.periods.length === 0) {
    console.error(TAG + " 计费配置中 timeBasedPricing.periods 为空。");
    return null;
  }

  // 未启用时段分价时，直接返回 default 段
  if (!timeConfig.enabled) {
    const defaultPeriod = timeConfig.periods.find((p) => p.name === "default");
    if (!defaultPeriod) {
      console.error(TAG + " 未启用时段分价但配置中无 default 段。");
      return null;
    }
    return defaultPeriod;
  }

  // 启用时段分价：获取当前时间，匹配时段
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // 将 "HH:MM" 转换为分钟数
  function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
  }

  for (const period of timeConfig.periods) {
    if (period.name === "default") continue; // 跳过 default 段（最后兜底用）

    const startMin = timeToMinutes(period.start);
    const endMin = timeToMinutes(period.end);

    let matched = false;
    if (startMin <= endMin) {
      // 普通时段：08:00-15:00
      matched = currentMinutes >= startMin && currentMinutes < endMin;
    } else {
      // 跨天时段：15:00-08:00（start > end）
      matched = currentMinutes >= startMin || currentMinutes < endMin;
    }

    if (matched) {
      console.log(TAG + " 命中时段: " + period.name + " (" + period.start + "-" + period.end + ")");
      return period;
    }
  }

  // 未命中任何特殊时段，兜底使用 default 段
  const defaultPeriod = timeConfig.periods.find((p) => p.name === "default");
  console.log(TAG + " 未命中任何特殊时段，兜底使用 default 段。");
  return defaultPeriod || null;
}

// ==================== 取价 ====================

/**
 * 从时段配置中提取指定 provider 和 model 的价格信息
 * @param {Object} period - 时段配置对象
 * @param {string} provider - 提供商名称（deepseek / grsai / volcengine / doc2x）
 * @param {string} model - 模型名称
 * @returns {Object|null} 价格对象，如 { input_cache_miss, input_cache_hit, output } 或 { per_image } 等
 */
function getPriceFromPeriod(period, provider, model) {
  if (!period || !period.providers) return null;

  const providerConfig = period.providers[provider];
  if (!providerConfig) {
    console.warn("[billing_config][getPriceFromPeriod] 提供商 " + provider + " 在时段 " + period.name + " 中无配置。");
    return null;
  }

  const modelPrice = providerConfig[model];
  if (!modelPrice) {
    console.warn("[billing_config][getPriceFromPeriod] 模型 " + model + " 在时段 " + period.name + " 中无配置。");
    return null;
  }

  return modelPrice;
}

// ==================== 模块导出 ====================
module.exports = { ceilTo7Decimals, loadConfig, getActivePeriodFromConfig, getPriceFromPeriod };
