// ==================== PDF→MD 流水线封装 ====================
// 职责：封装 Doc2x API 调用 → 下载 zip → 解压提取 MD → 清理临时文件
// 依赖：utils/doc2x.js (convertPdfToMarkdown)

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { convertPdfToMarkdown } = require("../../utils/doc2x");

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
 * 尝试从 zip 文件中提取 .md 内容
 * 使用 Node.js 内置的 zlib（zip 格式比较复杂，这里尝试多种方式）
 *
 * 简化方案：由于 Doc2x 返回的 .md 文件直接就是纯文本，我们尝试：
 * 1. 如果 URL 指向的是 .md 文件（非 zip），直接下载文本内容
 * 2. 如果是 zip，尝试用 adm-zip 解压
 *
 * @param {string} zipPath - zip 文件本地路径
 * @returns {Promise<string>} Markdown 文本内容
 */
async function extractMdFromZip(zipPath) {
  // 尝试使用 adm-zip
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    console.log(TAG + " zip 内文件列表: " + entries.map(e => e.entryName).join(", "));

    for (const entry of entries) {
      if (entry.entryName.endsWith(".md")) {
        const content = zip.readAsText(entry);
        console.log(TAG + " 从 zip 中提取 .md 文件: " + entry.entryName + ", 大小: " + content.length + " 字符");
        return content;
      }
    }

    // 没有 .md，尝试用第一个文本文件
    for (const entry of entries) {
      if (!entry.isDirectory) {
        const content = zip.readAsText(entry);
        console.log(TAG + " 从 zip 中提取首个文件: " + entry.entryName + ", 大小: " + content.length + " 字符");
        return content;
      }
    }

    throw new Error("zip 文件中未找到可提取的文本文件。");
  } catch (err) {
    if (err.message.includes("Cannot find module 'adm-zip'")) {
      throw new Error("adm-zip 未安装，无法解压 zip 文件。请运行: npm install adm-zip");
    }
    throw err;
  }
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
 * @returns {Promise<{markdownContent: string, fileName: string}>}
 */
async function convertPdfToMd(pdfFilePath) {
  console.log(TAG + " ========== PDF → MD 转换开始 ==========");

  ensureTempDir();

  // 1. 调用 Doc2x 转换
  const doc2xResult = await convertPdfToMarkdown(pdfFilePath);

  if (doc2xResult.code !== 200 || !doc2xResult.downloadUrl) {
    throw new Error("Doc2x 转换失败: " + (doc2xResult.message || "未知错误"));
  }

  const downloadUrl = doc2xResult.downloadUrl;
  console.log(TAG + " Doc2x 返回下载 URL: " + downloadUrl);

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
