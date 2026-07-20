// ==================== 标题生成服务模块 ====================
// 职责：调用 AI 为教材内容生成标题和副标题，并将结果写入数据库
// 本脚本在 MD 文件落盘后异步调用，放入后台自动执行，不影响主流程
//
// 执行步骤：
// 1. 从 MinIO 下载 MD 文件到本地临时目录
// 2. 使用 extractor_md 提取前 1000 行作为原文
// 3. 调用 utils/create_title.js 生成标题和副标题
// 4. 将结果写入数据库（title → name，subtitle → subtitle）
// 5. 清理临时文件
//
// 返回值格式：{ code: number, title?: string, subtitle?: string, message?: string }
//   code 200 — 成功生成标题并写入数据库
//   code 400 — 输入参数不合法
//   code 500 — API 调用失败或数据库更新失败
//   code 502 — AI 返回内容解析失败
//   code 503 — AI 返回 JSON 不包含必要字段
//
// 依赖模块：
//   - utils/create_title.js：调用 DeepSeek 小模型生成标题
//   - utils/extractor_md.js：从 MD 文件中提取指定行范围的文本
//   - utils/repo/book_repo.js：数据库操作（更新 name 和 subtitle 字段）

const fs = require("fs");
const path = require("path");
const os = require("os");
const Minio = require("minio");

// 导入工具模块
const { createTitle } = require("../utils/create_title");
const { extractLines } = require("../utils/extractor_md");
const bookRepo = require("../utils/repo/book_repo");

// ==================== MinIO 客户端初始化 ====================
const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
});

// MinIO Bucket 名称
const BUCKET = process.env.MINIO_BUCKET || "jinmao";

// 提取行数限制
const MAX_LINES = 1000;

// ==================== 核心函数 ====================

/**
 * 生成课程标题和副标题并写入数据库
 *
 * 本函数执行以下步骤：
 * 1. 输入验证
 * 2. 从 MinIO 下载 MD 文件到本地临时目录
 * 3. 提取前 1000 行作为原文
 * 4. 调用 AI 生成标题和副标题
 * 5. 更新数据库
 * 6. 清理临时文件
 *
 * @param {string|number} courseId - 课程 ID
 * @param {string} userId - 用户 ID
 * @param {string} filename - 教材原文件名
 * @param {string} textbookPath - MD 文件在 MinIO 中的路径
 * @returns {Promise<{ code: number, title?: string, subtitle?: string, message?: string }>}
 */
async function generateCourseTitle(courseId, userId, filename, textbookPath) {
    const TAG = "[service/create_title]";
    const startTime = Date.now();

    console.log("========================================");
    console.log(TAG + " 开始生成课程标题");
    console.log(TAG + " 课程ID: " + courseId + "，用户ID: " + userId);
    console.log(TAG + " 文件名: " + filename);
    console.log(TAG + " MD路径: " + textbookPath);
    console.log("========================================");

    // 创建临时工作目录
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jinmao-title-"));
    console.log(TAG + " 临时工作目录: " + tempDir);

    try {
        // ============ 步骤 1：输入验证 ============
        console.log(TAG + " 步骤 1/5: 输入验证...");

        if (!courseId && courseId !== 0) {
            console.error(TAG + " 课程 ID 不能为空");
            return { code: 400, message: "课程 ID 不能为空" };
        }
        if (!userId) {
            console.error(TAG + " 用户 ID 不能为空");
            return { code: 400, message: "用户 ID 不能为空" };
        }
        if (!filename || typeof filename !== "string") {
            console.error(TAG + " 文件名不能为空");
            return { code: 400, message: "文件名不能为空" };
        }
        if (!textbookPath || typeof textbookPath !== "string") {
            console.error(TAG + " MD 文件路径不能为空");
            return { code: 400, message: "MD 文件路径不能为空" };
        }
        console.log(TAG + " 输入验证通过");

        // ============ 步骤 2：从 MinIO 下载 MD 文件 ============
        console.log(TAG + " 步骤 2/5: 从 MinIO 下载 MD 文件...");

        const tempMDPath = path.join(tempDir, "source.md");
        try {
            await minioClient.fGetObject(BUCKET, textbookPath, tempMDPath);
            console.log(TAG + " MD 文件下载完成: " + tempMDPath);
        } catch (downloadErr) {
            console.error(TAG + " MinIO 下载失败: " + downloadErr.message);
            return { code: 500, message: "MinIO 文件下载失败: " + downloadErr.message };
        }

        // ============ 步骤 3：提取前 1000 行作为原文 ============
        console.log(TAG + " 步骤 3/5: 提取前 " + MAX_LINES + " 行作为原文...");

        const extractResult = extractLines(tempMDPath, 1, MAX_LINES);
        if (extractResult.code !== 200 && extractResult.code !== 206) {
            console.error(TAG + " 文本提取失败: " + extractResult.message);
            return { code: extractResult.code, message: "文本提取失败: " + extractResult.message };
        }

        const content = extractResult.text;
        console.log(TAG + " 文本提取成功，长度: " + content.length + " 字符");

        if (content.length === 0) {
            console.error(TAG + " 提取的文本内容为空");
            return { code: 500, message: "提取的文本内容为空" };
        }

        // ============ 步骤 4：调用 AI 生成标题 ============
        console.log(TAG + " 步骤 4/5: 调用 AI 生成标题...");

        const titleResult = await createTitle(filename, content);
        if (titleResult.code !== 200) {
            console.error(TAG + " 标题生成失败: " + titleResult.message);
            return { code: titleResult.code, message: "标题生成失败: " + titleResult.message };
        }

        const title = titleResult.title;
        const subtitle = titleResult.subtitle;
        console.log(TAG + " 标题生成成功！");
        console.log(TAG + " 标题: " + title);
        console.log(TAG + " 副标题: " + subtitle);

        // ============ 步骤 5：更新数据库 ============
        console.log(TAG + " 步骤 5/5: 更新数据库...");

        const updateResult = await bookRepo.updateCourse(courseId, {
            name: title,
            subtitle: subtitle,
        });

        if (updateResult.code !== 200) {
            console.error(TAG + " 数据库更新失败: " + updateResult.message);
            // 数据库更新失败不影响标题生成结果，仅记录日志
            console.warn(TAG + " 警告：标题已生成但数据库更新失败，请手动更新");
        } else {
            console.log(TAG + " 数据库更新成功");
        }

        // ============ 完成 ============
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log("========================================");
        console.log(TAG + " 课程标题生成完成！");
        console.log(TAG + " 耗时: " + elapsed + " 秒");
        console.log(TAG + " 标题: " + title);
        console.log(TAG + " 副标题: " + subtitle);
        console.log("========================================");

        return {
            code: 200,
            title: title,
            subtitle: subtitle,
            message: "标题生成成功"
        };

    } catch (error) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error("========================================");
        console.error(TAG + " 标题生成异常！");
        console.error(TAG + " 耗时: " + elapsed + " 秒");
        console.error(TAG + " 错误: " + error.message);
        console.error(error.stack);
        console.error("========================================");

        return {
            code: 500,
            message: "标题生成异常: " + error.message
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
 * 异步启动标题生成（不阻塞调用方）
 *
 * 本函数用于在后台异步执行标题生成，不影响主流程。
 * 使用 .catch() 确保异步异常不会导致 unhandledRejection。
 *
 * @param {string|number} courseId - 课程 ID
 * @param {string} userId - 用户 ID
 * @param {string} filename - 教材原文件名
 * @param {string} textbookPath - MD 文件在 MinIO 中的路径
 */
function startTitleGeneration(courseId, userId, filename, textbookPath) {
    const TAG = "[service/create_title]";

    console.log(TAG + " 启动异步标题生成...");
    console.log(TAG + " 课程ID: " + courseId + "，用户ID: " + userId);

    // 启动异步标题生成（不 await，让它在后台执行）
    generateCourseTitle(courseId, userId, filename, textbookPath)
        .then((result) => {
            if (result.code === 200) {
                console.log(TAG + " 异步标题生成成功: " + result.title + " - " + result.subtitle);
            } else {
                console.error(TAG + " 异步标题生成失败: " + result.message);
            }
        })
        .catch((err) => {
            console.error(TAG + " 异步标题生成未捕获异常: " + err.message);
            console.error(err.stack);
        });
}

// ==================== 模块导出 ====================
module.exports = {
    generateCourseTitle,
    startTitleGeneration
};
