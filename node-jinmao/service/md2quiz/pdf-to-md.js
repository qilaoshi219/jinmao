// ==================== PDF→MD 流水线封装 ====================
// 职责：封装 PDF 文件转 Markdown 的完整流程
//   - PDF: Doc2x API → 下载 zip → 7z 解压提取 MD → 清理

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { convertPdfToMarkdown } = require("../../utils/doc2x");
const extractZip = require("../../utils/extract_zip");
const { recordExternalCost } = require("../../utils/billing");

const TAG = "[md2quiz_pdf2md]";

/** 临时文件存放目录 */
const TEMP_DIR = path.resolve(__dirname, "../../data/temp_pdf");

/**
 * 确保临时目录存在
 */
function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log(TAG + " 创建临时目录: " + TEMP_DIR);
  }
}

/**
 * 下载文件到本地
 * @param {string} url  - 下载 URL
 * @param {string} dest - 本地保存路径
 * @returns {Promise<void>}
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(TAG + " 开始下载文件: " + url);
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const transport = isHttps ? https : http;

    transport
      .get(url, (response) => {
        // 处理重定向
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          resolve(downloadFile(response.headers.location, dest));
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`下载失败，HTTP ${response.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(dest);
        response.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          console.log(TAG + " 文件下载完成: " + dest);
          resolve();
        });

        fileStream.on("error", (err) => {
          fs.unlinkSync(dest);
          reject(err);
        });
      })
      .on("error", reject);
  });
}

/**
 * 使用 7z 解压 zip 文件并提取其中的 .md 内容
 * 复用项目已有的 extract_zip 模块（与 POSTbook.js 一致的 7z 解压方案）
 *
 * @param {string} zipPath - zip 文件本地路径
 * @returns {Promise<string>} Markdown 文本内容
 */
async function extractMdFromZip(zipPath) {
  console.log(TAG + " 使用 7z 解压 zip 文件: " + zipPath);

  // 调用项目统一的 7z 解压函数（会自动查找到 .md 主文档）
  const result = await extractZip.extractZip(zipPath);

  if (result.code !== 200 || !result.mainDocPath) {
    // 解压失败或未找到 .md 文件
    const errMsg = result.message || "zip 解压失败";
    console.error(TAG + " " + errMsg);
    throw new Error(errMsg);
  }

  const mainDocPath = result.mainDocPath;
  console.log(TAG + " 7z 解压完成，主文档路径: " + mainDocPath);

  // 从解压目录中读取 .md 文件内容
  const content = fs.readFileSync(mainDocPath, "utf8");
  console.log(TAG + " 从 zip 中提取 .md 内容，大小: " + content.length + " 字符");

  // 清理解压临时目录
  extractZip.cleanUp(result.extractDir);

  return content;
}

/**
 * 清理临时文件
 * @param {string[]} filePaths
 */
function cleanupTempFiles(filePaths) {
  filePaths.forEach((fp) => {
    try {
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
        console.log(TAG + " 已清理临时文件: " + fp);
      }
    } catch (_) {
      // 静默处理
    }
  });
}

/**
 * 将本地 PDF 文件通过 Doc2x 转换为 Markdown 文本
 *
 * @param {string} pdfFilePath - 本地 PDF 文件绝对路径
 * @param {string} [userId] - 用户 ID（用于计费，可选）
 * @returns {Promise<{markdownContent: string, fileName: string}>}
 */
async function convertPdfToMd(pdfFilePath, userId) {
  console.log(TAG + " ========== PDF → MD 转换开始 ==========");

  ensureTempDir();

  // 1. 调用 Doc2x 转换
  const doc2xResult = await convertPdfToMarkdown(pdfFilePath);

  if (doc2xResult.code !== 200 || !doc2xResult.downloadUrl) {
    throw new Error("Doc2x 转换失败: " + (doc2xResult.message || "未知错误"));
  }

  const downloadUrl = doc2xResult.downloadUrl;
  const pageCount = doc2xResult.pageCount || 0;
  console.log(TAG + " Doc2x 返回下载 URL: " + downloadUrl + "，页数: " + pageCount);

  // doc2x PDF解析计费（0.02元/页），异步记录不阻塞主流程
  if (userId) {
    recordExternalCost({
      userId, provider: "doc2x", model: "doc2x-api-v2",
      callTag: "doc2x", status: "success",
      pageCount,
    }).catch(err => console.error(TAG + " doc2x 计费记录失败: " + err.message));
  }

  // 2. 下载 zip 文件
  const baseName = path.basename(pdfFilePath, ".pdf");
  const zipPath = path.join(TEMP_DIR, baseName + ".zip");
  await downloadFile(downloadUrl, zipPath);

  // 3. 提取 MD 内容
  let markdownContent;
  try {
    markdownContent = await extractMdFromZip(zipPath);
  } catch (extractErr) {
    // 清理后再抛出
    cleanupTempFiles([zipPath, pdfFilePath]);
    throw extractErr;
  }

  // 4. 清理临时文件
  cleanupTempFiles([zipPath, pdfFilePath]);

  console.log(TAG + " PDF → MD 转换完成，MD 长度: " + markdownContent.length + " 字符");

  return {
    markdownContent,
    fileName: baseName + ".md",
  };
}

module.exports = { convertPdfToMd };
