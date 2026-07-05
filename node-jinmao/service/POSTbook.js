// ==================== 教材上传服务模块 ====================
// 职责：接收用户上传的教材文件，进行格式归一化处理后存入 MinIO，并启动课程流水线
// 支持 4 种文件格式：MD / 压缩包(zip/rar/7z) / PDF / Word(docx/doc)
// 归一产物统一为 Markdown 格式存储到 MinIO

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

// 导入工具模块
const bookRepo = require("../utils/repo/book_repo");
const uploadMinio = require("../utils/upload_minio");
const word2pdf = require("../utils/word2pdf");
const doc2x = require("../utils/doc2x");
const extractZip = require("../utils/extract_zip");
const inputValidator = require("../utils/input_validator");

// ==================== 常量 ====================
// 支持的教材文件扩展名
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".doc", ".md", ".zip", ".rar", ".7z"];
// 最大文件大小 500MB
const MAX_FILE_SIZE = 500 * 1024 * 1024;

// ==================== 辅助函数 ====================

/**
 * 生成 6 位随机字符串（大小写字母 + 数字）
 * 用于归一产物目录名防同名覆盖
 * @returns {string} 6 位随机字符串
 */
function generateRandomString() {
  return crypto.randomBytes(3).toString("base64url").slice(0, 6);
}

/**
 * 生成时间戳字符串（格式 YYYYMMDDTHHmmss）
 * @returns {string} 时间戳
 */
function generateTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) + "T" +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());
}

/**
 * 在目录中递归查找第一个 .md 文件
 * @param {string} dirPath - 目录路径
 * @returns {string|null} 找到的 MD 文件完整路径，未找到返回 null
 */
function findMdFile(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const result = findMdFile(fullPath); // 递归搜索子目录
      if (result) return result;
    } else if (entry.name.toLowerCase().endsWith(".md")) {
      return fullPath; // 找到第一个 MD 文件即返回
    }
  }
  return null;
}

// ==================== 主函数 ====================

/**
 * 上传教材文件并进行格式归一化
 * 
 * 处理流程：
 * 1. 输入校验（文件类型、大小）
 * 2. 创建 Course 数据库记录
 * 3. 上传源文件到 MinIO
 * 4. 格式归一化（4 分支：MD/压缩包/PDF/Word）
 * 5. 更新 Course 路径信息
 * 6. 异步启动课程流水线
 * 
 * @param {string} userId - 用户 ID（从 JWT 获取）
 * @param {Object} file - multer 文件对象 { originalname, path, mimetype, size }
 * @param {string} name - 教材名称（用户输入，可选）
 * @param {string} description - 教材描述（可选）
 * @param {boolean} elaborationEnabled - 是否开启文本细化（默认 true）
 * @returns {Promise<Object>} { code, message, data }
 */
async function uploadBook(userId, file, name, description, elaborationEnabled) {
  const startTime = Date.now();
  console.log("========================================");
  console.log("[POSTbook] 开始上传教材");
  console.log("[POSTbook] 用户ID: " + userId);
  console.log("[POSTbook] 文件名: " + file.originalname);
  console.log("[POSTbook] 文件大小: " + (file.size / 1024 / 1024).toFixed(2) + " MB");
  console.log("[POSTbook] 文本细化: " + (elaborationEnabled !== false ? "开启" : "关闭"));
  console.log("========================================");

  try {
    // ============ 步骤 1：输入校验 ============
    console.log("[POSTbook] 步骤 1/6: 输入校验...");

    // 校验文件扩展名是否合法
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      console.log("[POSTbook] 不支持的文件格式: " + ext);
      return {
        code: 422,
        message: "不支持的文件格式，仅支持 pdf/docx/doc/md/zip/rar/7z",
        data: null,
      };
    }

    // 校验文件大小
    if (file.size > MAX_FILE_SIZE) {
      console.log("[POSTbook] 文件过大: " + (file.size / 1024 / 1024).toFixed(2) + " MB");
      return {
        code: 422,
        message: "文件大小超过限制（最大 500MB）",
        data: null,
      };
    }

    // 教材名称默认取文件名（去掉扩展名）
    const courseName = name || path.basename(file.originalname, ext);
    console.log("[POSTbook] 教材名称: " + courseName);

    // ============ 步骤 2：创建 Course 数据库记录 ============
    console.log("[POSTbook] 步骤 2/6: 创建课程记录...");

    // 先生成 MinIO 路径所需的占位符，等待 courseId 返回后填充
    // createCourse 会返回自增 ID
    const initialResult = await bookRepo.createCourse({
      userId: userId,
      name: courseName,
      description: description || "",
      textbookFilename: file.originalname,
      textbookPath: "pending", // 占位，归一化完成后更新
      sourcePath: "pending",   // 占位，上传完成后更新
      elaborationEnabled: elaborationEnabled !== false, // 默认 true
    });

    if (initialResult.code !== 200) {
      console.log("[POSTbook] 创建课程记录失败: " + initialResult.message);
      return { code: 500, message: initialResult.message, data: null };
    }

    const courseId = initialResult.course.id;
    const baseMinioPath = "/usercourse/" + userId + "/" + courseId;
    console.log("[POSTbook] 课程记录创建成功，ID: " + courseId + "，MinIO 根路径: " + baseMinioPath);

    // ============ 步骤 3：上传源文件到 MinIO ============
    console.log("[POSTbook] 步骤 3/6: 上传源文件到 MinIO...");

    const sourceMinioPath = baseMinioPath + "/" + file.originalname;
    const sourceUploadResult = await uploadMinio.upload(file.path, sourceMinioPath);

    if (sourceUploadResult.code !== 0) {
      console.log("[POSTbook] 源文件上传失败: " + sourceUploadResult.message);
      return { code: 500, message: "源文件上传失败: " + sourceUploadResult.message, data: null };
    }
    console.log("[POSTbook] 源文件上传成功: " + sourceMinioPath);

    // ============ 步骤 4：格式归一化（4 分支） ============
    console.log("[POSTbook] 步骤 4/6: 格式归一化（文件类型: " + ext + "）...");

    // 生成归一产物目录名
    const normalizedDirName = path.basename(file.originalname, ext) + "-" + generateTimestamp() + "-" + generateRandomString();
    const normalizedMinioDir = baseMinioPath + "/" + normalizedDirName;
    let mdLocalPath = null; // 归一化后的 MD 本地路径
    let textbookMinioPath = null; // 归一化 MD 的 MinIO 路径

    // 创建临时工作目录
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jinmao-upload-"));

    try {
      switch (ext) {
        case ".md":
          // 分支 a：MD 文件直接上传
          console.log("[POSTbook] 分支 MD：直接上传 Markdown 文件");
          textbookMinioPath = normalizedMinioDir + "/" + file.originalname;
          const mdUploadResult = await uploadMinio.upload(file.path, textbookMinioPath);
          if (mdUploadResult.code !== 0) {
            return { code: 500, message: "MD 文件上传失败: " + mdUploadResult.message, data: null };
          }
          break;

        case ".zip":
        case ".rar":
        case ".7z":
          // 分支 b：压缩包解压后上传
          console.log("[POSTbook] 分支压缩包：解压后查找 MD 文件");
          const extractResult = await extractZip.extractZip(file.path, tempDir);
          if (extractResult.code !== 0) {
            return { code: 500, message: "压缩包解压失败: " + extractResult.message, data: null };
          }
          mdLocalPath = findMdFile(tempDir);
          if (!mdLocalPath) {
            return { code: 422, message: "压缩包中未找到 .md 文件", data: null };
          }
          textbookMinioPath = normalizedMinioDir + "/" + path.basename(mdLocalPath);
          await uploadMinio.upload(mdLocalPath, textbookMinioPath);
          console.log("[POSTbook] 压缩包内 MD 已上传: " + textbookMinioPath);
          break;

        case ".pdf":
          // 分支 c：PDF → doc2x → 解压 → 上传
          console.log("[POSTbook] 分支 PDF：调用 Doc2x 转换...");
          const doc2xResult = await doc2x.convertPdfToMarkdown(file.path);
          if (doc2xResult.code !== 0 || !doc2xResult.zipPath) {
            return { code: 500, message: "Doc2x 转换失败: " + (doc2xResult.message || "未知错误"), data: null };
          }
          console.log("[POSTbook] Doc2x 转换完成，解压产物...");
          const pdfExtractResult = await extractZip.extractZip(doc2xResult.zipPath, tempDir);
          if (pdfExtractResult.code !== 0) {
            return { code: 500, message: "Doc2x 产物解压失败: " + pdfExtractResult.message, data: null };
          }
          mdLocalPath = findMdFile(tempDir);
          if (!mdLocalPath) {
            return { code: 422, message: "Doc2x 转换后未找到 .md 文件", data: null };
          }
          textbookMinioPath = normalizedMinioDir + "/" + path.basename(mdLocalPath);
          await uploadMinio.upload(mdLocalPath, textbookMinioPath);
          console.log("[POSTbook] PDF 归一化 MD 已上传: " + textbookMinioPath);

          // 如果有 images 目录，一并上传
          const imageDir = path.join(path.dirname(mdLocalPath), "image");
          if (fs.existsSync(imageDir)) {
            console.log("[POSTbook] 发现图片目录，上传中...");
            const imageFiles = fs.readdirSync(imageDir);
            for (const imgFile of imageFiles) {
              const imgLocalPath = path.join(imageDir, imgFile);
              const imgMinioPath = normalizedMinioDir + "/image/" + imgFile;
              await uploadMinio.upload(imgLocalPath, imgMinioPath);
            }
            console.log("[POSTbook] 图片上传完成，共 " + imageFiles.length + " 张");
          }
          break;

        case ".docx":
        case ".doc":
          // 分支 d：Word → word2pdf → doc2x → 解压 → 上传
          console.log("[POSTbook] 分支 Word：调用 word2pdf 转换...");
          const pdfOutputDir = path.join(tempDir, "pdf_output");
          fs.mkdirSync(pdfOutputDir, { recursive: true });
          const word2pdfResult = await word2pdf.convert(file.path, pdfOutputDir);
          if (word2pdfResult.code !== 0 || !word2pdfResult.pdfPath) {
            return { code: 500, message: "Word 转 PDF 失败: " + (word2pdfResult.message || "未知错误"), data: null };
          }
          console.log("[POSTbook] Word 转 PDF 完成: " + word2pdfResult.pdfPath);

          console.log("[POSTbook] 调用 Doc2x 转换 PDF...");
          const wordDoc2xResult = await doc2x.convertPdfToMarkdown(word2pdfResult.pdfPath);
          if (wordDoc2xResult.code !== 0 || !wordDoc2xResult.zipPath) {
            return { code: 500, message: "Doc2x 转换失败: " + (wordDoc2xResult.message || "未知错误"), data: null };
          }

          console.log("[POSTbook] Doc2x 转换完成，解压产物...");
          const wordExtractResult = await extractZip.extractZip(wordDoc2xResult.zipPath, tempDir);
          if (wordExtractResult.code !== 0) {
            return { code: 500, message: "Doc2x 产物解压失败: " + wordExtractResult.message, data: null };
          }

          mdLocalPath = findMdFile(tempDir);
          if (!mdLocalPath) {
            return { code: 422, message: "Word 转换后未找到 .md 文件", data: null };
          }
          textbookMinioPath = normalizedMinioDir + "/" + path.basename(mdLocalPath);
          await uploadMinio.upload(mdLocalPath, textbookMinioPath);
          console.log("[POSTbook] Word 归一化 MD 已上传: " + textbookMinioPath);
          break;
      }
    } finally {
      // 清理临时目录
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log("[POSTbook] 临时目录已清理: " + tempDir);
      } catch (cleanErr) {
        console.log("[POSTbook] 清理临时目录时出现警告（非致命）: " + cleanErr.message);
      }
    }

    // ============ 步骤 5：更新 Course 路径信息 ============
    console.log("[POSTbook] 步骤 5/6: 更新课程路径信息...");

    await bookRepo.updateCourse(courseId, {
      sourcePath: sourceMinioPath,
      textbookPath: textbookMinioPath,
      pipelineStatus: "idle", // 归一化完成，等待流水线处理
    });

    // ============ 步骤 6：异步启动流水线 ============
    console.log("[POSTbook] 步骤 6/6: 启动课程流水线（异步）...");

    // 异步启动流水线，不阻塞上传响应
    // 使用 setTimeout 确保 HTTP 响应先返回，再启动流水线
    setTimeout(async () => {
      try {
        const pipeline = require("./course_pipeline");
        console.log("[POSTbook] 开始执行流水线，课程ID: " + courseId);
        await pipeline.pipeline(courseId);
        console.log("[POSTbook] 流水线执行完毕，课程ID: " + courseId);
      } catch (pipelineErr) {
        console.error("[POSTbook] 流水线执行异常: " + pipelineErr.message);
      }
    }, 100);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("========================================");
    console.log("[POSTbook] 教材上传完成！耗时: " + elapsed + " 秒");
    console.log("[POSTbook] 课程ID: " + courseId);
    console.log("[POSTbook] 源文件路径: " + sourceMinioPath);
    console.log("[POSTbook] 归一 MD 路径: " + textbookMinioPath);
    console.log("========================================");

    // 返回成功响应
    return {
      code: 0,
      message: "上传成功，正在处理中",
      data: {
        book_id: courseId,
        textbook_filename: file.originalname,
        textbook_path: textbookMinioPath,
        status: "processing",
      },
    };

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error("========================================");
    console.error("[POSTbook] 教材上传异常！耗时: " + elapsed + " 秒");
    console.error("[POSTbook] 错误: " + error.message);
    console.error(error.stack);
    console.error("========================================");

    return {
      code: 500,
      message: "教材上传处理异常: " + error.message,
      data: null,
    };
  }
}

// ==================== 导出 ====================
module.exports = { uploadBook };
