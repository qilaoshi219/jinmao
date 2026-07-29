// ==================== 文生图模块 ====================
// 调用 Grsai gpt-image-2 API，输入纯文本图片描述，输出图片 URL
// 交由调用脚本的程序进行落盘（如上传 MinIO 等）
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

// ==================== 核心函数 ====================

/**
 * 调用 Grsai gpt-image-2 API 生成图片（异步模式 + 轮询获取结果）
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
    // 验证 prompt 字符串：非空、非注入、长度限制
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

    // ========== 3. 构建请求体 ==========
    const requestBody = {
        model: config.GRSAI_MODEL,          // 模型名称，如 "gpt-image-2"
        prompt: prompt,                      // 图片描述文本
        images: images,                      // 参考图数组（可为空）
        aspectRatio: aspectRatio,            // 图片比例/分辨率
        replyType: "async"                   // 使用异步模式，提交后轮询获取结果
    };

    const generateUrl = config.GRSAI_API_BASE + GENERATE_PATH;
    console.log(TAG + " 准备提交文生图任务，目标接口：" + generateUrl);
    console.log(TAG + " 请求参数 — 模型：" + requestBody.model + "，比例：" + requestBody.aspectRatio + "，prompt长度：" + prompt.length);

    // ========== 4. 调用生成接口（提交异步任务） ==========
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
        console.error(TAG + " 生成接口网络请求失败：" + fetchError.message);
        return { code: 500, message: "文生图接口网络请求失败：" + fetchError.message };
    }

    // 检查 HTTP 状态码
    if (!generateResponse.ok) {
        const errorText = await generateResponse.text().catch(() => "无法读取响应体");
        console.error(TAG + " 生成接口返回 HTTP " + generateResponse.status + "：" + errorText);
        return { code: 500, message: "文生图接口返回错误（HTTP " + generateResponse.status + "）：" + errorText };
    }

    // 解析响应 JSON
    let generateData;
    try {
        generateData = await generateResponse.json();
    } catch (parseError) {
        console.error(TAG + " 生成接口响应 JSON 解析失败：" + parseError.message);
        return { code: 500, message: "文生图接口响应格式异常，无法解析 JSON。" };
    }

    console.log(TAG + " 生成接口响应：" + JSON.stringify({ id: generateData.id, status: generateData.status }));

    // 检查是否返回了任务 ID
    if (!generateData.id) {
        console.error(TAG + " 生成接口未返回任务 ID，响应内容：" + JSON.stringify(generateData));
        return { code: 500, message: "文生图接口未返回任务 ID，请检查请求参数或 API 配置。" };
    }

    const taskId = generateData.id;
    console.log(TAG + " 任务已提交，任务 ID：" + taskId + "，开始轮询结果...");

    // ========== 5. 轮询查询异步任务结果 ==========
    const pollInterval = config.GRSAI_POLL_INTERVAL_MS || 3000;  // 轮询间隔（毫秒）
    const maxRetries = config.GRSAI_POLL_MAX_RETRIES || 60;       // 最大轮询次数

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // 等待指定间隔后再查询（第一次也需要等待，给服务端处理时间）
        await sleep(pollInterval);

        const resultUrl = config.GRSAI_API_BASE + RESULT_PATH + "?id=" + encodeURIComponent(taskId);
        console.log(TAG + " 轮询第 " + attempt + "/" + maxRetries + " 次，查询任务状态...");

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
            console.error(TAG + " 轮询请求失败（第 " + attempt + " 次）：" + pollError.message);
            // 网络错误不立即返回，继续重试
            continue;
        }

        // 检查 HTTP 状态码
        if (!resultResponse.ok) {
            const errorText = await resultResponse.text().catch(() => "无法读取响应体");
            console.error(TAG + " 轮询接口返回 HTTP " + resultResponse.status + "（第 " + attempt + " 次）：" + errorText);
            continue;  // 继续重试
        }

        // 解析响应 JSON
        let resultData;
        try {
            resultData = await resultResponse.json();
        } catch (parseError) {
            console.error(TAG + " 轮询接口响应 JSON 解析失败（第 " + attempt + " 次）：" + parseError.message);
            continue;  // 继续重试
        }

        const status = resultData.status;
        const progress = resultData.progress !== undefined ? resultData.progress : "未知";
        console.log(TAG + " 任务状态：" + status + "，进度：" + progress + "%");

        // ---- 状态判断 ----

        // 生成成功：提取图片 URL 并返回
        if (status === "succeeded") {
            if (resultData.results && resultData.results.length > 0 && resultData.results[0].url) {
                const imageUrl = resultData.results[0].url;
                console.log(TAG + " 图片生成成功！URL：" + imageUrl);
                // ========== 计费记录：文生图成功，记为 1 张 ==========
                recordExternalCost({
                    userId: userId,
                    provider: "grsai",
                    model: config.GRSAI_MODEL,
                    callTag: "create_image",
                    status: "success",
                    imageCount: 1,
                    imageResolution: aspectRatio,
                }).catch(err => console.error(TAG + " 计费记录写入失败：" + err.message));
                return {
                    code: 200,
                    imageUrl: imageUrl,
                    taskId: taskId,
                    message: "图片生成成功"
                };
            } else {
                console.error(TAG + " 状态为 succeeded 但 results 中无图片 URL：" + JSON.stringify(resultData));
                return { code: 500, taskId: taskId, message: "图片生成成功但未返回图片 URL。" };
            }
        }

        // 任务失败
        if (status === "failed") {
            const errorMsg = resultData.error || "未知错误";
            console.error(TAG + " 任务失败：" + errorMsg);
            return { code: 502, taskId: taskId, message: "文生图任务失败：" + errorMsg };
        }

        // 内容违规
        if (status === "violation") {
            console.error(TAG + " 任务违规，内容被拦截。");
            return { code: 502, taskId: taskId, message: "文生图内容违规，已被系统拦截。" };
        }

        // running 状态：继续轮询
        if (status === "running") {
            // 继续下一轮
            continue;
        }

        // 未知状态：记录日志并继续轮询
        console.warn(TAG + " 遇到未知任务状态：" + status + "，继续轮询...");
    }

    // 轮询次数用尽，超时
    console.error(TAG + " 轮询超时，已尝试 " + maxRetries + " 次（共约 " + (maxRetries * pollInterval / 1000) + " 秒）。任务 ID：" + taskId);
    return {
        code: 504,
        taskId: taskId,
        message: "文生图轮询超时（" + (maxRetries * pollInterval / 1000) + " 秒），图片未能在限定时间内生成完成。"
    };
}

// ==================== 工具函数 ====================

/**
 * 延时等待（Promise 版 setTimeout）
 * @param {number} ms - 等待毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { createImage };
