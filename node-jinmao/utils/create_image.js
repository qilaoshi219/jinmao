// ==================== 文生图模块 ====================
// 调用 Grsai gpt-image-2 / gpt-image-2-vip API，输入纯文本图片描述，输出图片 URL
// 交由调用脚本的程序进行落盘（如上传 MinIO 等）
// 失败时自动在 gpt-image-2 与 gpt-image-2-vip 之间交替重试（共 3 轮，最多 6 次调用）
//
// 返回值格式：{ code: number, imageUrl?: string, message?: string }
//   code 200 — 成功生成图片，imageUrl 包含图片链接
//   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限等）
//   code 500 — API 调用失败（网络错误、鉴权失败、服务端错误等）
//   code 502 — 生成任务失败或内容违规
//   code 504 — 轮询超时，图片未能在限定时间内生成完成
//
// 使用 Node.js 原生 fetch（Node 18+ 内置），无需额外安装依赖

const { grsai: config } = require("../config");
const { validateString, validateFields } = require("./input_validator");
const { recordExternalCost } = require("./billing");

// ==================== 常量定义 ====================
// API 端点路径（拼接在 base URL 后面）
const GENERATE_PATH = "/v1/api/generate";   // 提交文生图任务
const RESULT_PATH = "/v1/api/result";       // 查询异步任务结果

// 整体重试配置：每个「轮次」= gpt-image-2 + gpt-image-2-vip 各尝试 1 次
// 共 MAX_RETRY_ROUNDS 轮，即最多 2 * MAX_RETRY_ROUNDS = 6 次调用
const MAX_RETRY_ROUNDS = 3;
// 重试基础延迟（毫秒）
const RETRY_BASE_DELAY_MS = 2000;
// 最大重试延迟（毫秒）
const RETRY_MAX_DELAY_MS = 10000;

// VIP 模型分辨率映射：gpt-image-2-vip 只接受像素值（不支持 "16:9" 这类比例）
// 值取自 GRS API 文档的 2K 档；未知比例回退 2048x2048
const VIP_ASPECT_RATIO_MAP = {
    "1:1": "2048x2048",
    "16:9": "2048x1152",
    "9:16": "1152x2048",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "3:2": "2048x1360",
    "2:3": "1360x2048",
    "5:4": "2240x1792",
    "4:5": "1792x2240",
    "21:9": "2912x1248",
    "9:21": "1248x2912",
    "1:2": "1536x3072",
    "2:1": "3072x1536",
    "1:3": "1280x3840",
    "3:1": "3840x1280",
};
// VIP 未知比例时的兜底分辨率
const VIP_ASPECT_RATIO_FALLBACK = "2048x2048";

// ==================== 工具函数 ====================

/**
 * 延时等待（Promise 版 setTimeout）
 * @param {number} ms - 等待毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 指数退避延迟计算（带随机抖动，避免多个并发重试同时发起）
 * @param {number} retryIndex - 当前重试次数（0-based，0=第1次重试）
 * @returns {number} 延迟毫秒数
 */
function getRetryDelay(retryIndex) {
    const baseDelay = RETRY_BASE_DELAY_MS * Math.pow(2, retryIndex);
    const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
    const delay = Math.min(baseDelay + jitter, RETRY_MAX_DELAY_MS);
    return Math.round(delay);
}

/**
 * 判断错误是否值得重试（网络错误、服务端错误等瞬时问题）
 * @param {string} errorMessage - 错误消息
 * @returns {boolean} 是否应该重试
 */
function isRetryableError(errorMessage) {
    if (!errorMessage) return true; // 未知错误，保守重试
    const msg = errorMessage.toLowerCase();
    // 网络层面错误 → 可重试
    if (msg.includes("fetch") && (msg.includes("failed") || msg.includes("error"))) return true;
    if (msg.includes("network")) return true;
    if (msg.includes("timeout") || msg.includes("timed out")) return true;
    if (msg.includes("econnreset") || msg.includes("econnrefused")) return true;
    if (msg.includes("5") && msg.includes("http")) return true; // HTTP 5xx 服务端错误
    if (msg.includes("无法解析 json")) return true; // 临时解析失败
    // 内容违规、参数错误等不可重试
    if (msg.includes("违规") || msg.includes("violation")) return false;
    if (msg.includes("参数") || msg.includes("400")) return false;
    // 默认：保守重试
    return true;
}

/**
 * 将请求比例转换为 gpt-image-2-vip 支持的像素值分辨率
 * VIP 模型只接受像素值（如 1024x1024、2048x2048），不支持 "16:9" 这类比例
 * @param {string} aspectRatio - 原始比例/分辨率，如 "16:9"、"1024x1024"、"auto"
 * @returns {string} VIP 模型可用的像素值分辨率
 */
function toVipAspectRatio(aspectRatio) {
    // auto 或已是像素值（如 1024x1024）：原样透传
    if (aspectRatio === "auto" || /^\d+x\d+$/i.test(aspectRatio)) {
        return aspectRatio;
    }
    const mapped = VIP_ASPECT_RATIO_MAP[aspectRatio];
    if (mapped) return mapped;
    console.warn("[create_image][toVipAspectRatio] 未识别比例 " + aspectRatio + "，VIP 回退使用 " + VIP_ASPECT_RATIO_FALLBACK);
    return VIP_ASPECT_RATIO_FALLBACK;
}

// ==================== 内部函数：单次图片生成尝试 ====================

/**
 * 执行一次完整的文生图流程（提交任务 + 轮询结果）
 * 不包含重试逻辑，仅执行单次尝试
 * 
 * @param {string} prompt - 图片描述文本
 * @param {Object} requestBody - 已构建好的请求体
 * @returns {Promise<{ code: number, imageUrl?: string, taskId?: string, message?: string, errorMessage?: string }>}
 */
async function attemptImageGeneration(prompt, requestBody) {
    const TAG = "[create_image][attempt]";

    const generateUrl = config.GRSAI_API_BASE + GENERATE_PATH;
    console.log(TAG + " 准备提交文生图任务，目标接口：" + generateUrl);
    console.log(TAG + " 请求参数 — 模型：" + requestBody.model + "，比例：" + requestBody.aspectRatio + "，prompt长度：" + prompt.length);

    // ========== 步骤1：提交异步任务 ==========
    let generateResponse;
    try {
        generateResponse = await fetch(generateUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + config.GRSAI_API_KEY
            },
            body: JSON.stringify(requestBody)
        });
    } catch (fetchError) {
        const errMsg = "文生图接口网络请求失败：" + fetchError.message;
        console.error(TAG + " " + errMsg);
        return { code: 500, message: errMsg, errorMessage: fetchError.message };
    }

    // 检查 HTTP 状态码
    if (!generateResponse.ok) {
        const errorText = await generateResponse.text().catch(() => "无法读取响应体");
        const errMsg = "文生图接口返回错误（HTTP " + generateResponse.status + "）：" + errorText;
        console.error(TAG + " " + errMsg);
        return { code: 500, message: errMsg, errorMessage: "HTTP " + generateResponse.status + ": " + errorText };
    }

    // 解析响应 JSON
    let generateData;
    try {
        generateData = await generateResponse.json();
    } catch (parseError) {
        const errMsg = "文生图接口响应 JSON 解析失败：" + parseError.message;
        console.error(TAG + " " + errMsg);
        return { code: 500, message: errMsg, errorMessage: parseError.message };
    }

    console.log(TAG + " 生成接口响应：" + JSON.stringify({ id: generateData.id, status: generateData.status }));

    // 检查是否返回了任务 ID
    if (!generateData.id) {
        const errMsg = "文生图接口未返回任务 ID，响应内容：" + JSON.stringify(generateData);
        console.error(TAG + " " + errMsg);
        return { code: 500, message: errMsg, errorMessage: "接口未返回任务ID" };
    }

    const taskId = generateData.id;
    console.log(TAG + " 任务已提交，任务 ID：" + taskId + "，开始轮询结果...");

    // ========== 步骤2：轮询查询异步任务结果 ==========
    const pollInterval = config.GRSAI_POLL_INTERVAL_MS || 3000;
    const maxRetries = config.GRSAI_POLL_MAX_RETRIES || 60;

    for (let pollAttempt = 1; pollAttempt <= maxRetries; pollAttempt++) {
        await sleep(pollInterval);

        const resultUrl = config.GRSAI_API_BASE + RESULT_PATH + "?id=" + encodeURIComponent(taskId);
        console.log(TAG + " 轮询第 " + pollAttempt + "/" + maxRetries + " 次，查询任务状态...");

        // 发起查询请求
        let resultResponse;
        try {
            resultResponse = await fetch(resultUrl, {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + config.GRSAI_API_KEY
                }
            });
        } catch (pollError) {
            console.error(TAG + " 轮询请求失败（第 " + pollAttempt + " 次）：" + pollError.message);
            continue; // 网络错误不立即返回，继续重试
        }

        // 检查 HTTP 状态码
        if (!resultResponse.ok) {
            const errorText = await resultResponse.text().catch(() => "无法读取响应体");
            console.error(TAG + " 轮询接口返回 HTTP " + resultResponse.status + "（第 " + pollAttempt + " 次）：" + errorText);
            continue; // 继续重试
        }

        // 解析响应 JSON
        let resultData;
        try {
            resultData = await resultResponse.json();
        } catch (parseError) {
            console.error(TAG + " 轮询接口响应 JSON 解析失败（第 " + pollAttempt + " 次）：" + parseError.message);
            continue; // 继续重试
        }

        const status = resultData.status;
        const progress = resultData.progress !== undefined ? resultData.progress : "未知";
        console.log(TAG + " 任务状态：" + status + "，进度：" + progress + "%");

        // ---- 状态判断 ----

        // 生成成功
        if (status === "succeeded") {
            if (resultData.results && resultData.results.length > 0 && resultData.results[0].url) {
                const imageUrl = resultData.results[0].url;
                console.log(TAG + " 图片生成成功！URL：" + imageUrl);
                return {
                    code: 200,
                    imageUrl: imageUrl,
                    taskId: taskId,
                    message: "图片生成成功"
                };
            } else {
                const errMsg = "图片生成成功但未返回图片 URL";
                console.error(TAG + " " + errMsg + "：" + JSON.stringify(resultData));
                return { code: 500, taskId: taskId, message: errMsg, errorMessage: "results中无图片URL" };
            }
        }

        // 任务失败
        if (status === "failed") {
            const errorMsg = resultData.error || "未知错误";
            console.error(TAG + " 任务失败：" + errorMsg);
            return { code: 502, taskId: taskId, message: "文生图任务失败：" + errorMsg, errorMessage: errorMsg };
        }

        // 内容违规
        if (status === "violation") {
            const errMsg = "文生图内容违规，已被系统拦截";
            console.error(TAG + " " + errMsg);
            return { code: 502, taskId: taskId, message: errMsg, errorMessage: "内容违规" };
        }

        // running 状态：继续轮询
        if (status === "running") {
            continue;
        }

        // 未知状态：记录日志并继续轮询
        console.warn(TAG + " 遇到未知任务状态：" + status + "，继续轮询...");
    }

    // 轮询次数用尽，超时
    const timeoutMsg = "文生图轮询超时（" + (maxRetries * pollInterval / 1000) + " 秒）";
    console.error(TAG + " " + timeoutMsg + "，任务 ID：" + taskId);
    return {
        code: 504,
        taskId: taskId,
        message: timeoutMsg + "，图片未能在限定时间内生成完成。",
        errorMessage: "轮询超时（" + maxRetries + "次/" + (maxRetries * pollInterval / 1000) + "秒）"
    };
}

// ==================== 核心函数：带重试的文生图 ====================

/**
 * 调用 Grsai 文生图 API（gpt-image-2 / gpt-image-2-vip）生成图片（异步模式 + 轮询获取结果）
 * 内置最多 3 轮交替重试（每轮 = gpt-image-2 + gpt-image-2-vip 各一次，共最多 6 次调用）
 * 遇到网络错误等服务端问题自动按 gpt-image-2 → gpt-image-2-vip 交替重试
 *
 * @param {string} userId - 用户 ID（用于计费关联）
 * @param {string} prompt - 图片描述文本，如 "一只金色柴犬在樱花树下奔跑"
 * @param {Object} [options] - 可选参数
 * @param {string} [options.aspectRatio] - 图片比例/分辨率，如 "1024x1024"、"16:9"，默认使用配置中的默认值
 * @param {string[]} [options.images] - 参考图数组（base64 或 URL），默认为空数组
 * @returns {{ code: number, imageUrl?: string, taskId?: string, message?: string }}
 */
async function createImage(userId, prompt, options = {}) {
    const TAG = "[create_image]";

    // ========== 1. 输入验证 ==========
    const promptResult = validateString(prompt, "图片描述(prompt)", {
        maxLength: 5000,
        required: true,
        moduleTag: TAG
    });
    if (!promptResult.valid) {
        console.error(TAG + " 输入验证未通过（code=" + promptResult.errorCode + "）：" + promptResult.error);
        return { code: promptResult.errorCode, message: promptResult.error };
    }

    // 验证可选的 aspectRatio 参数
    const aspectRatio = options.aspectRatio || config.GRSAI_DEFAULT_ASPECT_RATIO;
    if (options.aspectRatio) {
        const ratioResult = validateString(options.aspectRatio, "图片比例(aspectRatio)", {
            maxLength: 20,
            required: false,
            moduleTag: TAG
        });
        if (!ratioResult.valid) {
            console.error(TAG + " aspectRatio 验证未通过：" + ratioResult.error);
            return { code: ratioResult.errorCode, message: ratioResult.error };
        }
    }

    // 验证可选的 images 数组
    const images = options.images || [];
    if (!Array.isArray(images)) {
        return { code: 400, message: "参考图(images)必须为数组类型，如无参考图请传入空数组 []。" };
    }

    // ========== 2. 检查 API Key 是否配置 ==========
    if (!config.GRSAI_API_KEY || config.GRSAI_API_KEY === "你的APIKEY") {
        console.error(TAG + " GRSAI_API_KEY 未配置或仍为占位符，请在 .env 文件中填写真实的 API Key。");
        return { code: 500, message: "Grsai API Key 未配置，请在 .env 文件中设置 GRSAI_API_KEY。" };
    }

    // ========== 3. 构建尝试计划 ==========
    // 每轮 = gpt-image-2（普通）+ gpt-image-2-vip（VIP）各尝试一次
    // 共 MAX_RETRY_ROUNDS 轮，最多 2 * MAX_RETRY_ROUNDS = 6 次调用
    const vipModel = config.GRSAI_VIP_MODEL || "gpt-image-2-vip";
    const attemptPlan = [];
    for (let round = 0; round < MAX_RETRY_ROUNDS; round++) {
        attemptPlan.push({ model: config.GRSAI_MODEL, isVip: false });
        attemptPlan.push({ model: vipModel, isVip: true });
    }

    // ========== 4. 调用 API（普通模型与 VIP 模型交替重试） ==========
    let lastResult = null;
    let lastAttempt = null;
    let retriesPerformed = 0;

    for (let attempt = 0; attempt < attemptPlan.length; attempt++) {
        const currentAttempt = attemptPlan[attempt];
        lastAttempt = currentAttempt;

        // 非首次尝试时：等待退避延迟
        if (attempt > 0) {
            retriesPerformed = attempt;
            const delay = getRetryDelay(attempt - 1);
            console.log(TAG + " 第 " + attempt + " 次重试（共允许 " + (attemptPlan.length - 1) + " 次），等待 " + delay + "ms...");
            await sleep(delay);
        }

        // 构建请求体：VIP 尝试需将比例转换为像素值分辨率
        const requestBody = {
            model: currentAttempt.model,
            prompt: prompt,
            images: images,
            aspectRatio: currentAttempt.isVip ? toVipAspectRatio(aspectRatio) : aspectRatio,
            replyType: "async"
        };

        console.log(TAG + " ======== 第 " + (attempt + 1) + "/" + attemptPlan.length + " 次尝试（模型：" + requestBody.model + "，比例：" + requestBody.aspectRatio + "）========");
        const result = await attemptImageGeneration(prompt, requestBody);
        lastResult = result;

        // 成功：直接返回（按实际成功的模型与分辨率计费）
        if (result.code === 200) {
            // ========== 计费记录：文生图成功 ==========
            recordExternalCost({
                userId: userId,
                provider: "grsai",
                model: requestBody.model,
                callTag: "create_image",
                status: "success",
                imageCount: 1,
                imageResolution: requestBody.aspectRatio,
                retryCount: attempt,
            }).catch(err => console.error(TAG + " 计费记录写入失败：" + err.message));
            return result;
        }

        // 失败：判断是否应该重试
        const errorMsg = result.errorMessage || result.message || "";
        if (attempt < attemptPlan.length - 1 && isRetryableError(errorMsg)) {
            console.log(TAG + " 第 " + (attempt + 1) + " 次尝试失败（可重试），准备切换模型重试... 错误: " + errorMsg);
            continue; // 进入下一次尝试（切换模型）
        }

        // 不可重试 或 已达最大重试次数
        if (attempt >= attemptPlan.length - 1) {
            console.error(TAG + " 已达到最大尝试次数（" + attemptPlan.length + " 次），放弃重试。");
        } else {
            console.error(TAG + " 错误不可重试，放弃重试。");
        }
        break;
    }

    // ========== 5. 所有尝试失败：记录失败计费 ==========
    // 无论什么原因失败，都记录到账单数据库中，方便后续排查问题
    const failureResult = lastResult || { code: 500, message: "文生图失败（未知原因）", errorMessage: "未知错误" };
    const billingErrorMessage = failureResult.errorMessage || failureResult.message || "未知错误";
    const lastModel = (lastAttempt && lastAttempt.model) || config.GRSAI_MODEL;

    recordExternalCost({
        userId: userId,
        provider: "grsai",
        model: lastModel,
        callTag: "create_image",
        status: "failed",
        imageCount: 0,                      // 失败时图片数量为 0（不计费但记录调用事实）
        imageResolution: aspectRatio,
        errorMessage: billingErrorMessage,  // 记录失败原因
        retryCount: retriesPerformed,       // 记录实际重试了多少次
    }).catch(err => console.error(TAG + " 计费记录写入失败：" + err.message));

    console.error(TAG + " 文生图最终失败: " + failureResult.message);
    return failureResult;
}

// ==================== 模块导出 ====================
module.exports = { createImage };
