// 注意：本文件超过 300 行，但包含完整的教材上传服务逻辑（常量 + 4 个辅助函数 + 2 个核心函数），
// 各函数职责清晰、高内聚，不宜强行拆分，特此注明。

// ==================== 教材上传服务模块 ====================
// 职责：接收用户上传的教材文件，进行格式归一化处理后存入 MinIO，并启动课程流水线
// 支持 3 种文件格式：MD / 压缩包(zip/rar/7z) / PDF
// 归一产物统一为 Markdown 格式存储到 MinIO
//
// 架构说明（v1.1.0 重构）：
//   - uploadBook()：同步完成步骤 1-3（校验 + 创建 Course + 上传源文件），
//     然后启动异步归一化 runNormalization()，立即返回 courseId 给前端
//   - runNormalization()：后台异步执行步骤 4-6（归一化 + 更新路径 + 启动流水线）
//     归一化过程中更新 pipelineStatus 字段，前端可通过 GET /book/:id/status 轮询

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const https = require("https");
const http = require("http");

// 导入工具模块
const bookRepo = require("../utils/repo/book_repo");
const uploadMinio = require("../utils/upload_minio");
const doc2x = require("../utils/doc2x");
const extractZip = require("../utils/extract_zip");
const inputValidator = require("../utils/input_validator");
const { startTitleGeneration } = require("./create_title");
const { recordExternalCost } = require("../utils/billing");

// ==================== 常量 ====================
// 支持的教材文件扩展名
const ALLOWED_EXTENSIONS = [".pdf", ".md", ".zip", ".rar", ".7z"];
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

/**
 * 从 HTTPS/HTTP URL 下载文件到本地临时目录
 * 自动根据 URL 协议选择 http 或 https 模块
 * Doc2x 返回的 downloadUrl 是 OSS 预签名链接，无需认证头
 * @param {string} urlStr - 文件下载 URL（HTTP 或 HTTPS）
 * @param {string} destDir - 目标本地目录
 * @returns {Promise<{ code: number, localPath?: string, message?: string }>}
 */
function downloadFile(urlStr, destDir) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(urlStr);
    const isHttps = parsedUrl.protocol === "https:";
    const transport = isHttps ? https : http;

    // 从 URL 路径中提取文件名（如有 query 参数则去除）
    const urlPath = parsedUrl.pathname;
    const fileName = path.basename(urlPath) || "download.zip";
    // 安全处理：若文件名不含扩展名则默认 .zip
    const safeName = path.extname(fileName) ? fileName : fileName + ".zip";
    const localPath = path.join(destDir, safeName);

    console.log("[POSTbook][downloadFile] 开始下载: " + urlStr + " → " + localPath);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: {
        "User-Agent": "JinMao-Server/1.0",
      },
    };

    const req = transport.request(options, (res) => {
      // 处理重定向（OSS 预签名 URL 可能有 302 重定向）
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log("[POSTbook][downloadFile] 收到重定向 " + res.statusCode + " → " + res.headers.location);
        resolve(downloadFile(res.headers.location, destDir));
        return;
      }

      if (res.statusCode !== 200) {
        resolve({
          code: 500,
          message: "[POSTbook][downloadFile] 下载失败，HTTP " + res.statusCode,
        });
        return;
      }

      const writeStream = fs.createWriteStream(localPath);
      res.pipe(writeStream);

      writeStream.on("finish", () => {
        const fileSize = fs.statSync(localPath).size;
        console.log("[POSTbook][downloadFile] 下载完成，文件大小: " + (fileSize / 1024).toFixed(1) + " KB");
        resolve({ code: 0, localPath: localPath });
      });

      writeStream.on("error", (err) => {
        resolve({
          code: 500,
          message: "[POSTbook][downloadFile] 写入文件失败: " + err.message,
        });
      });
    });

    req.on("error", (err) => {
      resolve({
        code: 500,
        message: "[POSTbook][downloadFile] 网络请求失败: " + err.message,
      });
    });

    // 下载超时 5 分钟（Doc2x 返回的 zip 最大约 50MB）
    req.setTimeout(5 * 60 * 1000, () => {
      req.destroy();
      resolve({
        code: 500,
        message: "[POSTbook][downloadFile] 下载超时（5分钟）。",
      });
    });

    req.end();
  });
}

/**
 * 上传 MD 文件所在目录下的 images 文件夹到 MinIO
 * 同时检查 image 和 images 两种目录名（兼容不同 Doc2x 产物结构）
 * @param {string} mdLocalPath - MD 文件的本地绝对路径
 * @param {string} normalizedMinioDir - MinIO 中的目标目录路径
 * @returns {Promise<number>} 上传的图片文件数量
 */
async function uploadImageDir(mdLocalPath, normalizedMinioDir) {
  const mdDir = path.dirname(mdLocalPath); // MD 文件所在目录
  let imageDir = null;

  // 依次检查可能的图片目录名：image / images
  for (const candidate of ["image", "images"]) {
    const candidatePath = path.join(mdDir, candidate);
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory()) {
      imageDir = candidatePath;
      break;
    }
  }

  if (!imageDir) {
    // 未找到图片目录，输出 mdDir 内容供排查
    console.log("[POSTbook][uploadImageDir] 未找到图片目录（image / images），mdDir 内容如下：");
    try {
      const dirContents = fs.readdirSync(mdDir, { withFileTypes: true });
      dirContents.forEach(entry => {
        console.log("[POSTbook][uploadImageDir]   " + (entry.isDirectory() ? "[DIR] " : "[FILE]") + " " + entry.name);
      });
    } catch (listErr) {
      console.log("[POSTbook][uploadImageDir] 无法列出目录内容: " + listErr.message);
    }
    return 0;
  }

  console.log("[POSTbook][uploadImageDir] 发现图片目录: " + path.basename(imageDir) + "，上传中...");
  const imageFiles = fs.readdirSync(imageDir);
  let uploadCount = 0;
  for (const imgFile of imageFiles) {
    const imgLocalPath = path.join(imageDir, imgFile);
    // 跳过子目录，只上传文件
    if (!fs.statSync(imgLocalPath).isFile()) continue;
    const imgMinioPath = normalizedMinioDir + "/" + path.basename(imageDir) + "/" + imgFile;
    const uploadResult = await uploadMinio.upload(imgLocalPath, imgMinioPath);
    if (uploadResult.code === 200) {
      uploadCount++;
    } else {
      console.log("[POSTbook][uploadImageDir] 图片上传失败: " + imgFile + " - " + uploadResult.message);
    }
  }
  console.log("[POSTbook][uploadImageDir] 图片上传完成，共 " + uploadCount + "/" + imageFiles.length + " 张");
  return uploadCount;
}

// ==================== 主函数：上传教材（同步部分） ====================

/**
 * 上传教材文件（同步完成步骤 1-3，步骤 4-6 异步后台执行）
 * 
 * 同步处理流程（立即返回）：
 * 1. 输入校验（文件类型、大小）
 * 2. 创建 Course 数据库记录
 * 3. 上传源文件到 MinIO
 * 
 * 异步后台流程（不阻塞响应）：
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
    console.log("[POSTbook] 步骤 1/3: 输入校验...");

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
    console.log("[POSTbook] 步骤 2/3: 创建课程记录...");

    // 创建课程记录，源文件和归一化路径先设为 pending，后续异步更新
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
    console.log("[POSTbook] 步骤 3/3: 上传源文件到 MinIO...");

    const sourceMinioPath = baseMinioPath + "/" + file.originalname;
    const sourceUploadResult = await uploadMinio.upload(file.path, sourceMinioPath);

    if (sourceUploadResult.code !== 200) {
      console.log("[POSTbook] 源文件上传失败: " + sourceUploadResult.message);
      return { code: 500, message: "源文件上传失败: " + sourceUploadResult.message, data: null };
    }
    console.log("[POSTbook] 源文件上传成功: " + sourceMinioPath);

    // ============ 步骤 4-6：启动异步归一化（不阻塞响应） ============
    console.log("[POSTbook] 启动异步归一化流程...");

    // 更新状态为"正在归一化"
    await bookRepo.updatePipelineStatus(courseId, "normalizing");

    // 启动异步归一化（不 await，让它在后台执行）
    // 使用 .catch 确保异步异常不会导致 unhandledRejection
    runNormalization(courseId, userId, file, ext, baseMinioPath, sourceMinioPath, elaborationEnabled)
      .catch((err) => {
        console.error("[POSTbook] 异步归一化未捕获异常: " + err.message);
        console.error(err.stack);
      });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("========================================");
    console.log("[POSTbook] 教材上传完成（同步部分）！耗时: " + elapsed + " 秒");
    console.log("[POSTbook] 课程ID: " + courseId + "，归一化在后台进行中...");
    console.log("========================================");

    // 立即返回成功响应（归一化在后台异步执行）
    // 注意：courseId 是 BigInt 类型，必须转为 String 才能 JSON 序列化
    return {
      code: 0,
      message: "上传成功，正在处理中",
      data: {
        book_id: String(courseId),
        textbook_filename: file.originalname,
        status: "processing",
      },
    };

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error("========================================");
    console.error("[POSTbook] 教材上传异常（同步部分）！耗时: " + elapsed + " 秒");
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

// ==================== 异步归一化函数（步骤 4-6，后台执行） ====================

/**
 * 后台异步执行格式归一化 + 更新路径 + 启动流水线
 * 
 * 此函数在 uploadBook 返回后异步执行，不阻塞 HTTP 响应。
 * 归一化过程中会更新 pipelineStatus 字段，前端通过轮询获取进度。
 * 
 * @param {number} courseId - 课程 ID
 * @param {string} userId - 用户 ID
 * @param {Object} file - multer 文件对象 { originalname, path, mimetype, size }
 * @param {string} ext - 文件扩展名（如 .pdf）
 * @param {string} baseMinioPath - MinIO 根路径（/usercourse/{userId}/{courseId}）
 * @param {string} sourceMinioPath - 源文件在 MinIO 中的完整路径
 * @param {boolean} elaborationEnabled - 是否开启文本细化
 */
async function runNormalization(courseId, userId, file, ext, baseMinioPath, sourceMinioPath, elaborationEnabled) {
  const startTime = Date.now();
  console.log("========================================");
  console.log("[POSTbook][异步归一化] 开始后台处理，课程ID: " + courseId);
  console.log("[POSTbook][异步归一化] 文件类型: " + ext);
  console.log("========================================");

  // 创建临时工作目录
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jinmao-normalize-"));
  let textbookMinioPath = null; // 归一化后的 MD 在 MinIO 中的路径
  let mdLocalPath = null; // 归一化后的 MD 本地路径（用于调试日志）

  try {
    // ============ 步骤 4：格式归一化（4 分支） ============
    console.log("[POSTbook][异步归一化] 步骤 1/3: 格式归一化（文件类型: " + ext + "）...");

    // 生成归一产物目录名
    const courseName = path.basename(file.originalname, ext);
    const normalizedDirName = courseName + "-" + generateTimestamp() + "-" + generateRandomString();
    const normalizedMinioDir = baseMinioPath + "/" + normalizedDirName;

    switch (ext) {
      case ".md":
        // 分支 a：MD 文件直接上传
        console.log("[POSTbook][异步归一化] 分支 MD：直接上传 Markdown 文件");
        textbookMinioPath = normalizedMinioDir + "/" + file.originalname;
        const mdUploadResult = await uploadMinio.upload(file.path, textbookMinioPath);
        if (mdUploadResult.code !== 200) {
          throw new Error("MD 文件上传失败: " + mdUploadResult.message);
        }
        break;

      case ".zip":
      case ".rar":
      case ".7z":
        // 分支 b：压缩包解压后上传
        console.log("[POSTbook][异步归一化] 分支压缩包：解压后查找 MD 文件");
        const extractResult = await extractZip.extractZip(file.path);
        if (extractResult.code !== 200) {
          throw new Error("压缩包解压失败: " + extractResult.message);
        }
        // 注意：必须在 extractZip 返回的 extractDir 中查找，而不是 POSTbook 的 tempDir
        mdLocalPath = findMdFile(extractResult.extractDir);
        if (!mdLocalPath) {
          throw new Error("压缩包中未找到 .md 文件");
        }
        textbookMinioPath = normalizedMinioDir + "/" + path.basename(mdLocalPath);
        await uploadMinio.upload(mdLocalPath, textbookMinioPath);
        console.log("[POSTbook][异步归一化] 压缩包内 MD 已上传: " + textbookMinioPath);
        // 上传 images 文件夹（兼容 image / images 两种目录名）
        await uploadImageDir(mdLocalPath, normalizedMinioDir);
        break;

      case ".pdf":
        // 分支 c：PDF → doc2x → 下载 zip → 解压 → 上传
        console.log("[POSTbook][异步归一化] 分支 PDF：调用 Doc2x 转换...");
        // multer 临时文件无扩展名，doc2x 通过扩展名判断格式，
        // 需要先复制为带 .pdf 扩展名的临时文件
        const pdfTempPath = path.join(tempDir, "input.pdf");
        fs.copyFileSync(file.path, pdfTempPath);
        console.log("[POSTbook][异步归一化] 临时 PDF 文件: " + pdfTempPath);
        const doc2xResult = await doc2x.convertPdfToMarkdown(pdfTempPath);
        if (doc2xResult.code !== 200 || !doc2xResult.downloadUrl) {
          throw new Error("Doc2x 转换失败: " + (doc2xResult.message || "未知错误"));
        }
        // doc2x PDF解析计费（0.02元/页），异步记录不阻塞主流程
        recordExternalCost({
          userId, provider: "doc2x", model: "doc2x-api-v2",
          callTag: "doc2x", status: "success",
          pageCount: doc2xResult.pageCount || 0,
        }).catch(err => console.error("[POSTbook] doc2x 计费记录失败: " + err.message));
        console.log("[POSTbook][异步归一化] Doc2x 转换完成，页数: " + (doc2xResult.pageCount || 0) + "，下载产物 zip...");
        // Doc2x 返回的是 OSS 预签名下载链接，需先下载到本地再解压
        const dlResult = await downloadFile(doc2xResult.downloadUrl, tempDir);
        if (dlResult.code !== 0) {
          throw new Error("Doc2x 产物下载失败: " + dlResult.message);
        }
        console.log("[POSTbook][异步归一化] Doc2x 产物下载完成，解压...");
        const pdfExtractResult = await extractZip.extractZip(dlResult.localPath);
        if (pdfExtractResult.code !== 200) {
          throw new Error("Doc2x 产物解压失败: " + pdfExtractResult.message);
        }
        // 注意：必须在 extractZip 返回的 extractDir 中查找，而不是 tempDir
        mdLocalPath = findMdFile(pdfExtractResult.extractDir);
        if (!mdLocalPath) {
          throw new Error("Doc2x 转换后未找到 .md 文件");
        }
        textbookMinioPath = normalizedMinioDir + "/" + path.basename(mdLocalPath);
        await uploadMinio.upload(mdLocalPath, textbookMinioPath);
        console.log("[POSTbook][异步归一化] PDF 归一化 MD 已上传: " + textbookMinioPath);

        // 上传 images 文件夹（兼容 image / images 两种目录名）
        await uploadImageDir(mdLocalPath, normalizedMinioDir);
        break;
    }

    // ============ 步骤 5：更新 Course 路径信息 ============
    console.log("[POSTbook][异步归一化] 步骤 2/3: 更新课程路径信息...");

    await bookRepo.updateCourse(courseId, {
      sourcePath: sourceMinioPath,
      textbookPath: textbookMinioPath,
      pipelineStatus: "idle", // 归一化完成，等待流水线处理
    });

    // ============ 步骤 6：异步启动标题生成和流水线 ============
    console.log("[POSTbook][异步归一化] 步骤 3/3: 启动异步标题生成和课程流水线...");

    // 异步启动标题生成（不阻塞流水线启动）
    // 标题生成在后台执行，失败不影响主流程
    console.log("[POSTbook][异步归一化] 启动异步标题生成...");
    startTitleGeneration(courseId, userId, file.originalname, textbookMinioPath);

    // 异步启动流水线，不阻塞当前异步归一化流程
    // 使用 setTimeout 确保数据库更新先完成，再启动流水线
    setTimeout(async () => {
      try {
        const pipeline = require("./course_pipeline");
        console.log("[POSTbook][异步归一化] 开始执行流水线，课程ID: " + courseId);
        await pipeline.pipeline(courseId);
        console.log("[POSTbook][异步归一化] 流水线执行完毕，课程ID: " + courseId);
      } catch (pipelineErr) {
        console.error("[POSTbook][异步归一化] 流水线执行异常: " + pipelineErr.message);
        // 流水线异常时更新状态为 error
        try {
          await bookRepo.updatePipelineStatus(courseId, "error");
        } catch (statusErr) {
          console.error("[POSTbook][异步归一化] 更新错误状态失败: " + statusErr.message);
        }
      }
    }, 100);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("========================================");
    console.log("[POSTbook][异步归一化] 归一化完成！耗时: " + elapsed + " 秒");
    console.log("[POSTbook][异步归一化] 课程ID: " + courseId);
    console.log("[POSTbook][异步归一化] 归一 MD 路径: " + textbookMinioPath);
    console.log("========================================");

  } catch (error) {
    // 归一化过程中发生异常，记录日志并更新状态为 error
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error("========================================");
    console.error("[POSTbook][异步归一化] 归一化异常！耗时: " + elapsed + " 秒");
    console.error("[POSTbook][异步归一化] 课程ID: " + courseId);
    console.error("[POSTbook][异步归一化] 错误: " + error.message);
    console.error(error.stack);
    console.error("========================================");

    // 更新课程状态为 error
    try {
      await bookRepo.updatePipelineStatus(courseId, "error");
      console.log("[POSTbook][异步归一化] 课程状态已更新为 error");
    } catch (statusErr) {
      console.error("[POSTbook][异步归一化] 更新错误状态失败: " + statusErr.message);
    }
  } finally {
    // 清理临时目录
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log("[POSTbook][异步归一化] 临时目录已清理: " + tempDir);
    } catch (cleanErr) {
      console.log("[POSTbook][异步归一化] 清理临时目录时出现警告（非致命）: " + cleanErr.message);
    }
  }
}

// ==================== 导出 ====================
module.exports = { uploadBook };
