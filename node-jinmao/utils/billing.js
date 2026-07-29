// ==================== 计费模块 ====================
// 职责：价格计算、时段匹配、写入数据库账单
// 支持三种计费方式：LLM Token 计费、文生图计费、TTS 字符计费
// 价格从 config/billing_pricing.json 实时读取，修改后无需重启服务
//
// 导出函数：
//   recordTokenUsage(data)    — LLM Token 计费（由 llm_client.js 自动调用）
//   recordExternalCost(data)  — 文生图 / TTS 等非 LLM 计费
//   getActivePeriod()         — 获取当前时段配置（供 llm_client.js 计算价格用）

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

// ==================== Prisma 客户端初始化 ====================
const prisma = new PrismaClient();
console.log("[billing] Prisma 客户端已初始化。");

// ==================== 定价配置路径 ====================
const PRICING_CONFIG_PATH = path.join(__dirname, "..", "config", "billing_pricing.json");

// ==================== 计费标签映射 ====================
// callTag → 日志中显示的中文名称
const CALL_TAG_LABELS = {
    elaboration: "口播稿扩写",
    outline: "大纲生成",
    title: "标题生成",
    getline: "行号识别",
    htmlppt: "HTML PPT 生成",
    create_image: "文生图",
    tts: "文本转语音",
};

// ==================== 核心函数：读取定价配置 ====================

/**
 * 实时读取 billing_pricing.json 配置文件
 * 每次调用都重新读取，确保修改配置后无需重启服务即可生效
 * @returns {Object} 定价配置对象，若读取失败返回 null
 */
function loadPricingConfig() {
    try {
        const raw = fs.readFileSync(PRICING_CONFIG_PATH, "utf-8");
        const config = JSON.parse(raw);
        return config;
    } catch (err) {
        console.error("[billing][loadPricingConfig] 读取定价配置文件失败：" + err.message);
        return null;
    }
}

// ==================== 核心函数：时段匹配 ====================

/**
 * 根据当前时间匹配计费时段
 * 若 timeBasedPricing.enabled = false，始终返回 "default" 段
 * 若 enabled = true，按 periods 顺序匹配第一个命中的时段
 *
 * 跨天时段（start > end，如 15:00 → 08:00）特殊处理：
 *   当前时间 >= start 或 当前时间 < end → 命中
 *
 * @returns {{ name: string, start: string, end: string, providers: Object } | null}
 */
function getActivePeriod() {
    const TAG = "[billing][getActivePeriod]";
    const config = loadPricingConfig();
    if (!config) {
        console.error(TAG + " 定价配置不可用，无法确定计费时段。");
        return null;
    }

    const timeConfig = config.timeBasedPricing;
    if (!timeConfig || !timeConfig.periods || timeConfig.periods.length === 0) {
        console.error(TAG + " 定价配置中 timeBasedPricing.periods 为空。");
        return null;
    }

    // 未启用时段分价时，直接返回 default 段
    if (!timeConfig.enabled) {
        const defaultPeriod = timeConfig.periods.find(p => p.name === "default");
        if (!defaultPeriod) {
            console.error(TAG + " 未启用时段分价但配置中无 default 段。");
            return null;
        }
        console.log(TAG + " 时段分价未启用，使用 default 段 (00:00-24:00)。");
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
    const defaultPeriod = timeConfig.periods.find(p => p.name === "default");
    console.log(TAG + " 未命中任何特殊时段，兜底使用 default 段。");
    return defaultPeriod || null;
}

// ==================== 核心函数：获取指定 provider+model 的时段价格 ====================

/**
 * 从时段配置中提取指定 provider 和 model 的价格信息
 * @param {Object} period - 时段配置对象
 * @param {string} provider - 提供商名称（deepseek / grsai / volcengine）
 * @param {string} model - 模型名称
 * @returns {Object|null} 价格对象，如 { input_cache_miss, input_cache_hit, output } 或 { per_image } 或 { per_char }
 */
function getPriceFromPeriod(period, provider, model) {
    if (!period || !period.providers) return null;

    const providerConfig = period.providers[provider];
    if (!providerConfig) {
        console.warn("[billing][getPriceFromPeriod] 提供商 " + provider + " 在时段 " + period.name + " 中无配置。");
        return null;
    }

    const modelPrice = providerConfig[model];
    if (!modelPrice) {
        console.warn("[billing][getPriceFromPeriod] 模型 " + model + " 在时段 " + period.name + " 中无配置。");
        return null;
    }

    return modelPrice;
}

// ==================== 核心函数：写入数据库账单 ====================

/**
 * 将计费记录写入 billing_record 表
 * @param {Object} record - 计费记录数据
 * @returns {Promise<boolean>} 写入成功返回 true
 */
async function saveBillingRecord(record) {
    try {
        await prisma.billing_record.create({ data: record });
        return true;
    } catch (err) {
        console.error("[billing][saveBillingRecord] 写入数据库失败：" + err.message);
        return false;
    }
}

// ==================== 对外接口：LLM Token 计费 ====================

/**
 * 记录 DeepSeek LLM Token 使用费用（由 llm_client.js 自动调用）
 *
 * @param {Object} data - 计费数据
 * @param {string} data.userId - 用户 ID
 * @param {string} data.provider - 提供商（固定 "deepseek"）
 * @param {string} data.model - 模型名称
 * @param {string} data.callTag - 调用标签（elaboration / outline / title / getline / htmlppt）
 * @param {string} data.status - 调用状态（success / failed）
 * @param {number} data.promptTokens - 输入总 token 数
 * @param {number} data.cacheHitTokens - 缓存命中 token 数
 * @param {number} data.cacheMissTokens - 缓存未命中 token 数
 * @param {number} data.completionTokens - 输出 token 数
 * @param {number} data.totalTokens - 总 token 数
 * @returns {Promise<{ totalCost: number }>} 总费用（元）
 */
async function recordTokenUsage(data) {
    const TAG = "[billing][recordTokenUsage]";
    const {
        userId, provider, model, callTag, status,
        promptTokens, cacheHitTokens, cacheMissTokens, completionTokens
    } = data;

    // 获取当前时段
    const period = getActivePeriod();
    if (!period) {
        console.error(TAG + " 无法获取计费时段，跳过计费。");
        return { totalCost: 0 };
    }

    // 获取该时段的价格
    const price = getPriceFromPeriod(period, provider, model);
    if (!price) {
        console.error(TAG + " 无法获取价格，跳过计费。provider=" + provider + ", model=" + model);
        return { totalCost: 0 };
    }

    // 计算费用（价格单位为 元/百万tokens，需除以 1,000,000）
    const hitTokens = cacheHitTokens || 0;
    const missTokens = cacheMissTokens || 0;
    const outTokens = completionTokens || 0;

    const inputCost = (hitTokens / 1000000) * (price.input_cache_hit || 0)
                    + (missTokens / 1000000) * (price.input_cache_miss || 0);
    const outputCost = (outTokens / 1000000) * (price.output || 0);
    const totalCost = inputCost + outputCost;

    // 构建数据库记录
    const record = {
        user_id: String(userId),
        provider: provider,
        model: model,
        call_tag: callTag,
        status: status,
        prompt_tokens: promptTokens || 0,
        cache_hit_tokens: hitTokens,
        cache_miss_tokens: missTokens,
        completion_tokens: outTokens,
        total_tokens: (promptTokens || 0) + outTokens,
        time_period: period.name,
        input_unit_price: price.input_cache_miss || null,
        input_cache_hit_price: price.input_cache_hit || null,
        output_unit_price: price.output || null,
        input_cost: inputCost,
        output_cost: outputCost,
        total_cost: totalCost,
    };

    // 写入数据库
    const saved = await saveBillingRecord(record);

    // 控制台日志输出
    console.log(TAG + " ======== LLM 调用计费 ========");
    console.log(TAG + " 用户: " + userId + " | 时间: " + new Date().toISOString());
    console.log(TAG + " 提供商: " + provider + " | 模型: " + model);
    console.log(TAG + " 调用: " + callTag + " (" + (CALL_TAG_LABELS[callTag] || callTag) + ") | 状态: " + status);
    console.log(TAG + " Token: 缓存命中=" + hitTokens + ", 缓存未命中=" + missTokens + ", 输出=" + outTokens);
    console.log(TAG + " 时段: " + period.name + " (" + period.start + "-" + period.end + ")");
    console.log(TAG + " 单价: 输入¥" + (price.input_cache_miss || 0) + "/¥" + (price.input_cache_hit || 0) + "(命中) | 输出¥" + (price.output || 0) + " (元/百万tokens)");
    console.log(TAG + " 输入费用: ¥" + inputCost.toFixed(6) + " | 输出费用: ¥" + outputCost.toFixed(6));
    console.log(TAG + " 总费用: ¥" + totalCost.toFixed(6) + (saved ? "" : " (数据库写入失败!)"));
    console.log(TAG + " ================================");

    return { totalCost };
}

// ==================== 对外接口：文生图 / TTS 计费 ====================

/**
 * 记录文生图或 TTS 的非 Token 计费（由 create_image.js / text_tts.js 调用）
 *
 * @param {Object} data - 计费数据
 * @param {string} data.userId - 用户 ID
 * @param {string} data.provider - 提供商（grsai / volcengine）
 * @param {string} data.model - 模型名称
 * @param {string} data.callTag - 调用标签（create_image / tts）
 * @param {string} data.status - 调用状态（success / failed）
 * @param {number} [data.imageCount] - 图片数量（文生图专用，默认 1）
 * @param {string} [data.imageResolution] - 图片分辨率（文生图专用）
 * @param {number} [data.textLength] - 文本长度（TTS 专用）
 * @param {number} [data.audioDuration] - 音频时长（TTS 专用，可选）
 * @returns {Promise<{ totalCost: number }>} 总费用（元）
 */
async function recordExternalCost(data) {
    const TAG = "[billing][recordExternalCost]";
    const {
        userId, provider, model, callTag, status,
        imageCount, imageResolution, textLength, audioDuration
    } = data;

    // 获取当前时段
    const period = getActivePeriod();
    if (!period) {
        console.error(TAG + " 无法获取计费时段，跳过计费。");
        return { totalCost: 0 };
    }

    // 获取该时段的价格
    const price = getPriceFromPeriod(period, provider, model);
    if (!price) {
        console.error(TAG + " 无法获取价格，跳过计费。provider=" + provider + ", model=" + model);
        return { totalCost: 0 };
    }

    // 根据计费类型计算费用
    let totalCost = 0;
    let unitPrice = 0;
    let unitLabel = ""; // 单价标签，用于日志输出

    if (callTag === "create_image") {
        // 文生图：按张数计费
        const count = imageCount || 1;
        unitPrice = price.per_image || 0;
        totalCost = count * unitPrice;
        unitLabel = "元/张";
    } else if (callTag === "tts") {
        // TTS：按字符数计费
        const chars = textLength || 0;
        unitPrice = price.per_char || 0;
        totalCost = chars * unitPrice;
        unitLabel = "元/字符";
    } else {
        console.warn(TAG + " 未知的 callTag: " + callTag + "，跳过计费。");
        return { totalCost: 0 };
    }

    // 构建数据库记录
    const record = {
        user_id: String(userId),
        provider: provider,
        model: model,
        call_tag: callTag,
        status: status,
        image_count: callTag === "create_image" ? (imageCount || 1) : null,
        image_resolution: callTag === "create_image" ? (imageResolution || null) : null,
        text_length: callTag === "tts" ? (textLength || 0) : null,
        audio_duration: callTag === "tts" ? (audioDuration || null) : null,
        time_period: period.name,
        image_unit_price: callTag === "create_image" ? unitPrice : null,
        tts_unit_price: callTag === "tts" ? unitPrice : null,
        total_cost: totalCost,
    };

    // 写入数据库
    const saved = await saveBillingRecord(record);

    // 控制台日志输出
    console.log(TAG + " ======== 外部 API 调用计费 ========");
    console.log(TAG + " 用户: " + userId + " | 时间: " + new Date().toISOString());
    console.log(TAG + " 提供商: " + provider + " | 模型: " + model);
    console.log(TAG + " 调用: " + callTag + " (" + (CALL_TAG_LABELS[callTag] || callTag) + ") | 状态: " + status);
    if (callTag === "create_image") {
        console.log(TAG + " 图片数量: " + (imageCount || 1) + " | 分辨率: " + (imageResolution || "N/A"));
    } else if (callTag === "tts") {
        console.log(TAG + " 文本长度: " + (textLength || 0) + " 字符 | 音频时长: " + (audioDuration || 0) + " 秒");
    }
    console.log(TAG + " 时段: " + period.name + " (" + period.start + "-" + period.end + ")");
    console.log(TAG + " 单价: ¥" + unitPrice + " " + unitLabel);
    console.log(TAG + " 总费用: ¥" + totalCost.toFixed(6) + (saved ? "" : " (数据库写入失败!)"));
    console.log(TAG + " ================================");

    return { totalCost };
}

// ==================== 模块导出 ====================
module.exports = { recordTokenUsage, recordExternalCost, getActivePeriod };
