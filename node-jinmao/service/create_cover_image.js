// ==================== 图书封面图片生成服务模块 ====================
// 职责：调用文生图 API 生成课程封面图片，上传到 MinIO 后将 URL 写入数据库
// 本脚本在 md 文件转换结束后异步调用，放入后台自动执行，不影响主线生成程序执行
//
// 返回值格式：{ code: number, coverUrl?: string, message?: string }
//   code 200 — 成功生成封面并上传
//   code 400 — 输入参数不合法（空值/类型错误）
//   code 500 — API 调用失败或上传失败
//   code 502 — 生成任务失败或内容违规
//   code 504 — 轮询超时
//
// 依赖模块：
//   - utils/create_image.js：文生图 API 调用（Grsai gpt-image-2）
//   - utils/upload_minio.js：MinIO 文件上传
//   - utils/repo/book_repo.js：数据库操作（更新 coverPath 字段）

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const os = require("os");

// 导入工具模块
const { createImage } = require("../utils/create_image");
const uploadMinio = require("../utils/upload_minio");
const bookRepo = require("../utils/repo/book_repo");
const inputValidator = require("../utils/input_validator");

// ==================== 常量定义 ====================
// 提示词模板文件路径
const COVER_PROMPT_PATH = path.join(__dirname, "..", "config", "cover_prompt.txt");

// 默认图片比例（16:9，适合课程封面）
const DEFAULT_ASPECT_RATIO = "16:9";

// 图片临时文件名
const TEMP_IMAGE_NAME = "cover.png";

// ==================== 辅助函数 ====================

/**
 * 加载提示词模板并替换占位符
 * @param {string} title - 课程标题
 * @param {string} sample - 内容片段
 * @returns {{ success: boolean, prompt?: string, error?: string }}
 */
function loadAndBuildPrompt(title, sample) {
    const TAG = "[create_cover_image][loadAndBuildPrompt]";

    try {
        // 检查提示词模板文件是否存在
        if (!fs.existsSync(COVER_PROMPT_PATH)) {
            const errMsg = TAG + " 错误：提示词模板文件不存在，路径: " + COVER_PROMPT_PATH;
            console.error(errMsg);
            return { success: false, error: errMsg };
        }

        // 读取提示词模板
        let template = fs.readFileSync(COVER_PROMPT_PATH, "utf-8");
        console.log(TAG + " 提示词模板加载成功，长度: " + template.length);

        // 替换占位符
        template = template.replace(/\{\{title\}\}/g, title);
        template = template.replace(/\{\{sample\}\}/g, sample);

        console.log(TAG + " 提示词构建完成，最终长度: " + template.length);
        return { success: true, prompt: template };
    } catch (err) {
        const errMsg = TAG + " 错误：加载提示词模板失败: " + err.message;
        console.error(errMsg);
        return { success: false, error: errMsg };
    }
}

/**
 * 从 URL 下载图片到本地临时目录
 * @param {string} imageUrl - 图片 URL
 * @param {string} destDir - 目标目录
 * @returns {Promise<{ code: number, localPath?: string, message?: string }>}
 */
function downloadImage(imageUrl, destDir) {
    const TAG = "[create_cover_image][downloadImage]";

    return new Promise((resolve) => {
        const parsedUrl = new URL(imageUrl);
        const isHttps = parsedUrl.protocol === "https:";
        const transport = isHttps ? https : http;

        const localPath = path.join(destDir, TEMP_IMAGE_NAME);
        console.log(TAG + " 开始下载图片: " + imageUrl);
        console.log(TAG + " 保存到: " + localPath);

        const request = transport.get(imageUrl, (response) => {
            // 处理重定向
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                console.log(TAG + " 重定向到: " + response.headers.location);
                downloadImage(response.headers.location, destDir).then(resolve);
                return;
            }

            // 检查响应状态码
            if (response.statusCode !== 200) {
                const errMsg = TAG + " 错误：下载失败，HTTP 状态码: " + response.statusCode;
                console.error(errMsg);
                resolve({ code: 500, message: errMsg });
                return;
            }

            // 创建文件写入流
            const fileStream = fs.createWriteStream(localPath);
            response.pipe(fileStream);

            fileStream.on("finish", () => {
                fileStream.close();
                console.log(TAG + " 图片下载成功: " + localPath);
                resolve({ code: 200, localPath: localPath });
            });

            fileStream.on("error", (err) => {
                const errMsg = TAG + " 错误：文件写入失败: " + err.message;
                console.error(errMsg);
                resolve({ code: 500, message: errMsg });
            });
        });

        request.on("error", (err) => {
            const errMsg = TAG + " 错误：网络请求失败: " + err.message;
            console.error(errMsg);
            resolve({ code: 500, message: errMsg });
        });

        // 设置超时（30秒）
        request.setTimeout(30000, () => {
            request.destroy();
            const errMsg = TAG + " 错误：下载超时（30秒）";
            console.error(errMsg);
            resolve({ code: 504, message: errMsg });
        });
    });
}

/**
 * 输入参数验证
 * @param {string|number} courseId - 课程 ID
 * @param {string} userId - 用户 ID
 * @param {string} title - 课程标题
 * @param {string} sample - 内容片段
 * @returns {{ valid: boolean, errorCode?: number, error?: string }}
 */
function validateInput(courseId, userId, title, sample) {
    const TAG = "[create_cover_image][validateInput]";

    // 验证 courseId
    if (!courseId && courseId !== 0) {
        const errMsg = TAG + " 错误：课程 ID (courseId) 不能为空";
        console.error(errMsg);
        return { valid: false, errorCode: 400, error: errMsg };
    }

    // 验证 userId
    if (!userId) {
        const errMsg = TAG + " 错误：用户 ID (userId) 不能为空";
        console.error(errMsg);
        return { valid: false, errorCode: 400, error: errMsg };
    }

    // 验证 title
    const titleResult = inputValidator.validateString(title, "课程标题(title)", {
        maxLength: 200,
        required: true,
        moduleTag: TAG
    });
    if (!titleResult.valid) {
        return { valid: false, errorCode: titleResult.errorCode, error: titleResult.error };
    }

    // 验证 sample
    const sampleResult = inputValidator.validateString(sample, "内容片段(sample)", {
        maxLength: 2000,
        required: true,
        moduleTag: TAG
    });
    if (!sampleResult.valid) {
        return { valid: false, errorCode: sampleResult.errorCode, error: sampleResult.error };
    }

    console.log(TAG + " 输入验证通过");
    return { valid: true };
}

// ==================== 核心函数 ====================

/**
 * 生成课程封面图片并上传到 MinIO
 * 
 * 本函数执行以下步骤：
 * 1. 验证输入参数
 * 2. 加载提示词模板并替换占位符
 * 3. 调用文生图 API 生成封面图片
 * 4. 下载图片到本地临时目录
 * 5. 上传到 MinIO
 * 6. 更新数据库 coverPath 字段
 * 7. 返回结果
 * 
 * @param {string|number} courseId - 课程 ID
 * @param {string} userId - 用户 ID（用于构建 MinIO 路径）
 * @param {string} title - 课程标题
 * @param {string} sample - 内容片段（用于生成封面的参考）
 * @returns {Promise<{ code: number, coverUrl?: string, message?: string }>}
 */
async function createCoverImage(courseId, userId, title, sample) {
    const TAG = "[create_cover_image]";
    const startTime = Date.now();

    console.log("========================================");
    console.log(TAG + " 开始生成课程封面图片");
    console.log(TAG + " 课程ID: " + courseId + "，用户ID: " + userId);
    console.log(TAG + " 课程标题: " + title);
    console.log("========================================");

    // 创建临时工作目录
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jinmao-cover-"));
    console.log(TAG + " 临时工作目录: " + tempDir);

    try {
        // ============ 步骤 1：输入验证 ============
        console.log(TAG + " 步骤 1/6: 输入验证...");
        const validation = validateInput(courseId, userId, title, sample);
        if (!validation.valid) {
            console.error(TAG + " 输入验证失败: " + validation.error);
            return { code: validation.errorCode, message: validation.error };
        }

        // ============ 步骤 2：加载提示词模板 ============
        console.log(TAG + " 步骤 2/6: 加载提示词模板...");
        const promptResult = loadAndBuildPrompt(title, sample);
        if (!promptResult.success) {
            console.error(TAG + " 提示词加载失败: " + promptResult.error);
            return { code: 500, message: promptResult.error };
        }

        const prompt = promptResult.prompt;
        console.log(TAG + " 提示词构建完成，长度: " + prompt.length);

        // ============ 步骤 3：调用文生图 API ============
        console.log(TAG + " 步骤 3/6: 调用文生图 API...");
        const imageResult = await createImage(userId, prompt, {
            aspectRatio: DEFAULT_ASPECT_RATIO
        });

        // 检查文生图结果
        if (imageResult.code !== 200) {
            console.error(TAG + " 文生图失败，错误码: " + imageResult.code + "，消息: " + imageResult.message);
            return {
                code: imageResult.code,
                message: "封面图片生成失败: " + imageResult.message
            };
        }

        const imageUrl = imageResult.imageUrl;
        console.log(TAG + " 文生图成功，图片URL: " + imageUrl);

        // ============ 步骤 4：下载图片到本地 ============
        console.log(TAG + " 步骤 4/6: 下载图片到本地...");
        const downloadResult = await downloadImage(imageUrl, tempDir);
        if (downloadResult.code !== 200) {
            console.error(TAG + " 图片下载失败: " + downloadResult.message);
            return { code: downloadResult.code, message: downloadResult.message };
        }

        const localImagePath = downloadResult.localPath;
        console.log(TAG + " 图片下载成功: " + localImagePath);

        // ============ 步骤 5：上传到 MinIO ============
        console.log(TAG + " 步骤 5/6: 上传到 MinIO...");
        const minioPath = "/usercourse/" + userId + "/" + courseId + "/" + TEMP_IMAGE_NAME;
        console.log(TAG + " MinIO 目标路径: " + minioPath);

        const uploadResult = await uploadMinio.upload(localImagePath, minioPath);
        if (uploadResult.code !== 200) {
            console.error(TAG + " MinIO 上传失败: " + uploadResult.message);
            return { code: uploadResult.code, message: "封面图片上传失败: " + uploadResult.message };
        }

        const coverUrl = uploadResult.url;
        console.log(TAG + " MinIO 上传成功，URL: " + coverUrl);

        // ============ 步骤 6：更新数据库 ============
        console.log(TAG + " 步骤 6/6: 更新数据库 coverPath 字段...");
        const updateResult = await bookRepo.updateCourse(courseId, {
            coverPath: minioPath
        });

        if (updateResult.code !== 200) {
            console.error(TAG + " 数据库更新失败: " + updateResult.message);
            // 数据库更新失败不影响封面生成结果，仅记录日志
            console.warn(TAG + " 警告：封面图片已上传但数据库更新失败，请手动更新 coverPath");
        } else {
            console.log(TAG + " 数据库更新成功");
        }

        // ============ 完成 ============
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log("========================================");
        console.log(TAG + " 课程封面生成完成！");
        console.log(TAG + " 耗时: " + elapsed + " 秒");
        console.log(TAG + " 封面URL: " + coverUrl);
        console.log("========================================");

        return {
            code: 200,
            coverUrl: coverUrl,
            message: "封面图片生成成功"
        };

    } catch (error) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error("========================================");
        console.error(TAG + " 封面生成异常！");
        console.error(TAG + " 耗时: " + elapsed + " 秒");
        console.error(TAG + " 错误: " + error.message);
        console.error(error.stack);
        console.error("========================================");

        return {
            code: 500,
            message: "封面图片生成异常: " + error.message
        };
    } finally {
        // 清理临时目录
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
                console.log(TAG + " 临时目录已清理: " + tempDir);
            }
        } catch (cleanupError) {
            console.warn(TAG + " 警告：临时目录清理失败: " + cleanupError.message);
        }
    }
}

/**
 * 异步启动封面生成（不阻塞调用方）
 * 
 * 本函数用于在后台异步执行封面生成，不影响主线程序执行。
 * 使用 .catch() 确保异步异常不会导致 unhandledRejection。
 * 
 * @param {string|number} courseId - 课程 ID
 * @param {string} userId - 用户 ID
 * @param {string} title - 课程标题
 * @param {string} sample - 内容片段
 */
function startCoverGeneration(courseId, userId, title, sample) {
    const TAG = "[create_cover_image]";

    console.log(TAG + " 启动异步封面生成...");
    console.log(TAG + " 课程ID: " + courseId + "，用户ID: " + userId);

    // 启动异步封面生成（不 await，让它在后台执行）
    createCoverImage(courseId, userId, title, sample)
        .then((result) => {
            if (result.code === 200) {
                console.log(TAG + " 异步封面生成成功: " + result.coverUrl);
            } else {
                console.error(TAG + " 异步封面生成失败: " + result.message);
            }
        })
        .catch((err) => {
            console.error(TAG + " 异步封面生成未捕获异常: " + err.message);
            console.error(err.stack);
        });
}

// ==================== 模块导出 ====================
module.exports = {
    createCoverImage,
    startCoverGeneration
};