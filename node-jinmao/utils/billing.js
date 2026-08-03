// ==================== 计费模块 ====================
// 职责：售价计算、成本计算、写入数据库账单
// 售价从 config/billing_pricing.json 实时读取（共享工具在 utils/billing_config.js）
// 成本从 config/model_cost_config.json 实时读取（计算逻辑在 utils/billing_cost.js）
// 利润 = 售价(total_cost) - 成本(cost_total)
// 支持三种计费方式：LLM Token 计费、文生图计费、TTS 字符计费、doc2x 按页计费
//
// 导出函数：
//   recordTokenUsage(data)    — LLM Token 计费（由 llm_client.js 自动调用）
//   recordExternalCost(data)  — 文生图 / TTS / doc2x 等非 LLM 计费
//   getActivePeriod()         — 获取当前售价时段配置
//   ceilTo7Decimals(value)    — 金额向上取整到 7 位小数

const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { loadConfig, getActivePeriodFromConfig, getPriceFromPeriod, ceilTo7Decimals } = require("./billing_config");
const { computeTokenCost, computeExternalCost } = require("./billing_cost");

// ==================== Prisma 客户端初始化 ====================
const prisma = new PrismaClient();
console.log("[billing] Prisma 客户端已初始化。");

// ==================== 售价配置路径 ====================
const PRICING_CONFIG_PATH = path.join(__dirname, "..", "config", "billing_pricing.json");

// ==================== 计费标签映射 ====================
// callTag → 日志中显示的中文名称
// 注意：此映射表被 API/billing.js 引用，修改时需保持同步
const CALL_TAG_LABELS = {
    elaboration: "口播稿扩写",
    outline: "大纲生成",
    title: "标题生成",
    getline: "行号识别",
    htmlppt: "HTML PPT 生成",
    create_image: "文生图",
    tts: "文本转语音",
    doc2x: "PDF解析",
    md2quiz_split: "题库分段(AI)",
    md2quiz_format: "题库格式化(AI)",
    md2quiz_generate: "题库生成(AI)",
    course_ai_chat: "AI助教问答",
    course_ai_suggest: "AI追问推荐",
};

// ==================== 获取当前售价时段 ====================

/**
 * 获取当前售价时段（时段匹配逻辑在 billing_config.js 中，与成本配置共用）
 * @returns {{ name: string, start: string, end: string, providers: Object } | null}
 */
function getActivePeriod() {
  return getActivePeriodFromConfig(loadConfig(PRICING_CONFIG_PATH));
}

// ==================== 核心函数：写入数据库账单 ====================

/**
 * 将计费记录写入 billing_record 表
 * @param {Object} record - 计费记录数据（必须包含 error_message 和 retry_count 字段）
 * @returns {Promise<boolean>} 写入成功返回 true
 */
async function saveBillingRecord(record) {
    try {
        // 确保 error_message 和 retry_count 有默认值（兼容旧调用方）
        const safeRecord = {
            ...record,
            error_message: record.error_message || null,
            retry_count: record.retry_count || 0,
        };
        await prisma.billing_record.create({ data: safeRecord });
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
 * @param {string} [data.errorMessage] - 失败原因（仅 status=failed 时有效，可选）
 * @param {number} [data.retryCount] - 重试次数（0 表示首次调用，可选，默认 0）
 * @returns {Promise<{ totalCost: number }>} 总费用（元）
 */
async function recordTokenUsage(data) {
    const TAG = "[billing][recordTokenUsage]";
    const {
        userId, provider, model, callTag, status,
        promptTokens, cacheHitTokens, cacheMissTokens, completionTokens,
        errorMessage, retryCount
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

    const inputCost = ceilTo7Decimals((hitTokens / 1000000) * (price.input_cache_hit || 0)
                    + (missTokens / 1000000) * (price.input_cache_miss || 0));
    const outputCost = ceilTo7Decimals((outTokens / 1000000) * (price.output || 0));
    const totalCost = ceilTo7Decimals(inputCost + outputCost);

    // 计算成本（成本配置缺失某模型时回退为按售价计算并告警）
    const cost = computeTokenCost(provider, model, hitTokens, missTokens, outTokens);
    if (!cost) {
        console.warn(TAG + " 成本配置缺失（provider=" + provider + ", model=" + model + "），成本按售价回退计算。");
    }
    const costTotal = cost ? cost.totalCost : totalCost;

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
        cost_input_unit_price: cost ? cost.inputUnitPrice : (price.input_cache_miss || null),
        cost_input_cache_hit_price: cost ? cost.cacheHitUnitPrice : (price.input_cache_hit || null),
        cost_output_unit_price: cost ? cost.outputUnitPrice : (price.output || null),
        cost_input_cost: cost ? cost.inputCost : inputCost,
        cost_output_cost: cost ? cost.outputCost : outputCost,
        cost_total: costTotal,
        error_message: errorMessage || null,  // 失败原因（仅 status=failed 时记录）
        retry_count: retryCount || 0,          // 重试次数
    };

    // 写入数据库
    const saved = await saveBillingRecord(record);

    // 写入成功后，自动扣减用户余额
    if (saved && totalCost > 0) {
        // 延迟引入避免循环依赖（balance.js 不引用 billing.js，这里单向引用是安全的）
        const { deductBalance } = require("./balance");
        await deductBalance(userId, totalCost).catch(err => {
            console.error(TAG + " 扣减余额失败（账单已记录）: " + err.message);
        });
    }

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
    console.log(TAG + " 成本: ¥" + costTotal.toFixed(6) + " | 利润: ¥" + (totalCost - costTotal).toFixed(6));
    console.log(TAG + " ================================");

    return { totalCost };
}

// ==================== 对外接口：文生图 / TTS 计费 ====================

/**
 * 记录文生图或 TTS 的非 Token 计费（由 create_image.js / text_tts.js 调用）
 *
 * @param {Object} data - 计费数据
 * @param {string} data.userId - 用户 ID
 * @param {string} data.provider - 提供商（grsai / volcengine / doc2x）
 * @param {string} data.model - 模型名称
 * @param {string} data.callTag - 调用标签（create_image / tts / doc2x）
 * @param {string} data.status - 调用状态（success / failed）
 * @param {number} [data.imageCount] - 图片数量（文生图专用，默认 1）
 * @param {string} [data.imageResolution] - 图片分辨率（文生图专用）
 * @param {number} [data.textLength] - 文本长度（TTS 专用）
 * @param {number} [data.audioDuration] - 音频时长（TTS 专用，可选）
 * @param {number} [data.pageCount] - 页数（doc2x PDF解析专用）
 * @param {string} [data.errorMessage] - 失败原因（仅 status=failed 时有效，可选）
 * @param {number} [data.retryCount] - 重试次数（0 表示首次调用，可选，默认 0）
 * @returns {Promise<{ totalCost: number }>} 总费用（元）
 */
async function recordExternalCost(data) {
    const TAG = "[billing][recordExternalCost]";
    const {
        userId, provider, model, callTag, status,
        imageCount, imageResolution, textLength, audioDuration, pageCount,
        errorMessage, retryCount
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
        totalCost = ceilTo7Decimals(count * unitPrice);
        unitLabel = "元/张";
    } else if (callTag === "doc2x") {
        // doc2x PDF解析：按页计费
        const pages = pageCount || 0;
        unitPrice = price.per_page || 0;
        totalCost = ceilTo7Decimals(pages * unitPrice);
        unitLabel = "元/页";
    } else if (callTag === "tts") {
        // TTS：按字符数计费
        const chars = textLength || 0;
        unitPrice = price.per_char || 0;
        totalCost = ceilTo7Decimals(chars * unitPrice);
        unitLabel = "元/字符";
    } else {
        console.warn(TAG + " 未知的 callTag: " + callTag + "，跳过计费。");
        return { totalCost: 0 };
    }

    // 计算成本（成本配置缺失某模型时回退为按售价计算并告警）
    const cost = computeExternalCost(provider, model, callTag, { imageCount, textLength, pageCount });
    if (!cost) {
        console.warn(TAG + " 成本配置缺失（provider=" + provider + ", model=" + model + ", callTag=" + callTag + "），成本按售价回退计算。");
    }
    const costTotal = cost ? cost.totalCost : totalCost;

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
        page_count: callTag === "doc2x" ? (pageCount || 0) : null,
        time_period: period.name,
        image_unit_price: callTag === "create_image" ? unitPrice : null,
        tts_unit_price: callTag === "tts" ? unitPrice : null,
        page_unit_price: callTag === "doc2x" ? unitPrice : null,
        total_cost: totalCost,
        cost_image_unit_price: callTag === "create_image" ? (cost ? cost.unitPrice : unitPrice) : null,
        cost_tts_unit_price: callTag === "tts" ? (cost ? cost.unitPrice : unitPrice) : null,
        cost_page_unit_price: callTag === "doc2x" ? (cost ? cost.unitPrice : unitPrice) : null,
        cost_total: costTotal,
        error_message: errorMessage || null,  // 失败原因（仅 status=failed 时记录）
        retry_count: retryCount || 0,          // 重试次数
    };

    // 写入数据库
    const saved = await saveBillingRecord(record);

    // 写入成功后，自动扣减用户余额
    if (saved && totalCost > 0) {
        const { deductBalance } = require("./balance");
        await deductBalance(userId, totalCost).catch(err => {
            console.error(TAG + " 扣减余额失败（账单已记录）: " + err.message);
        });
    }

    // 控制台日志输出
    console.log(TAG + " ======== 外部 API 调用计费 ========");
    console.log(TAG + " 用户: " + userId + " | 时间: " + new Date().toISOString());
    console.log(TAG + " 提供商: " + provider + " | 模型: " + model);
    console.log(TAG + " 调用: " + callTag + " (" + (CALL_TAG_LABELS[callTag] || callTag) + ") | 状态: " + status);
    if (callTag === "create_image") {
        console.log(TAG + " 图片数量: " + (imageCount || 1) + " | 分辨率: " + (imageResolution || "N/A"));
    } else if (callTag === "doc2x") {
        console.log(TAG + " PDF页数: " + (pageCount || 0) + " 页");
    } else if (callTag === "tts") {
        console.log(TAG + " 文本长度: " + (textLength || 0) + " 字符 | 音频时长: " + (audioDuration || 0) + " 秒");
    }
    console.log(TAG + " 时段: " + period.name + " (" + period.start + "-" + period.end + ")");
    console.log(TAG + " 单价: ¥" + unitPrice + " " + unitLabel);
    console.log(TAG + " 总费用: ¥" + totalCost.toFixed(6) + (saved ? "" : " (数据库写入失败!)"));
    console.log(TAG + " 成本: ¥" + costTotal.toFixed(6) + " | 利润: ¥" + (totalCost - costTotal).toFixed(6));
    console.log(TAG + " ================================");

    return { totalCost };
}

// ==================== 模块导出 ====================
module.exports = { recordTokenUsage, recordExternalCost, getActivePeriod, CALL_TAG_LABELS, ceilTo7Decimals };
