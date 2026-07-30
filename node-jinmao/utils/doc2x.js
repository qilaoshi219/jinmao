// 本模块负责将 PDF 文件通过 Doc2x API v2 转换为 Markdown 压缩包
// 输入：本地 PDF 文件路径（由调用方负责从 MinIO 下载后传入）
// 输出：Markdown 压缩包网络下载 URL（API 返回的 zip 文件下载链接）
//
// API 调用流程（5 步）：
//   1. POST /api/v2/parse/preupload        → 获取预上传 OSS URL + uid
//   2. HTTP PUT 预上传 URL                  → 上传 PDF 文件到 OSS
//   3. GET /api/v2/parse/status?uid=xxx     → 轮询解析状态（processing → success/failed）
//   4. POST /api/v2/convert/parse           → 触发导出（to: "md"）
//   5. GET /api/v2/convert/parse/result     → 轮询导出结果，获取 zip 下载 URL
//
// 返回值格式：{ code: number, downloadUrl?: string, message?: string }
//   code 200 — 转换成功，返回 downloadUrl（zip 压缩包下载链接）
//   code 400 — 输入参数不合法（路径为空/类型错误）
//   code 404 — 指定的 PDF 文件不存在
//   code 500 — doc2x API 调用失败（网络错误/服务端错误/业务错误/超时）
//   code 502 — API 返回数据解析失败
//   code 504 — 配置加载失败（doc2x 配置不存在或格式错误）
//
// 依赖：Node.js 内置模块 https、http、fs、path
// 配置：config/doc2x_config.json（DOC2X_API_KEY / DOC2X_API_BASE）
// API 参考：doc/Doc2x-API-v2-PDF-接口文档最新版.md

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { validateString } = require("./input_validator");
const { doc2x: doc2xConfig } = require("../config"); // 统一配置入口（敏感字段从 .env 注入）

// ==================== 通用工具函数 ====================

/**
 * 延时辅助函数（用于轮询间隔）
 * @param {number} ms - 延时毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 通用 HTTP 请求封装 ====================

/**
 * 发起 HTTP/HTTPS 请求并获取完整响应体
 * 自动根据 URL 协议选择 http 或 https 模块
 * @param {string} urlStr - 完整的请求 URL
 * @param {string} method - HTTP 方法（GET / POST / PUT）
 * @param {object} headers - 请求头
 * @param {string|Buffer|null} body - 请求体（GET 请求传 null）
 * @returns {Promise<{ success: boolean, statusCode?: number, data?: string, errorCode?: number, error?: string }>}
 */
function httpRequest(urlStr, method, headers, body) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(urlStr);
    const isHttps = parsedUrl.protocol === "https:";
    const transport = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: headers,
      // 忽略自签名证书等问题（用于测试环境，生产环境应配置合法证书）
      rejectUnauthorized: isHttps ? true : undefined,
    };

    const req = transport.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk.toString();
      });

      res.on("end", () => {
        resolve({
          success: true,
          statusCode: res.statusCode,
          data: responseData,
        });
      });
    });

    req.on("error", (err) => {
      let errMsg = "[doc2x][httpRequest] HTTP 请求失败: " + err.message;
      console.error(errMsg);
      resolve({ success: false, errorCode: 500, error: errMsg });
    });

    // 设置请求超时（30 秒，单个 API 请求不需要太长）
    req.setTimeout(30000, () => {
      req.destroy();
      resolve({
        success: false,
        errorCode: 500,
        error: "[doc2x][httpRequest] HTTP 请求超时（30秒）。",
      });
    });

    // 写入请求体
    if (body !== null && body !== undefined) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * 发起 API 请求到 Doc2x 服务端（封装鉴权头和 JSON 解析）
 * @param {string} baseUrl - Doc2x API Base URL
 * @param {string} apiKey - API Key
 * @param {string} apiPath - API 路径（如 /api/v2/parse/preupload）
 * @param {string} method - HTTP 方法
 * @param {object|null} jsonBody - JSON 请求体
 * @returns {Promise<{ success: boolean, data?: object, errorCode?: number, error?: string }>}
 */
async function apiRequest(baseUrl, apiKey, apiPath, method, jsonBody) {
  const headers = {
    "Authorization": "Bearer " + apiKey,
    "Content-Type": "application/json",
  };

  const body = jsonBody ? JSON.stringify(jsonBody) : null;
  const result = await httpRequest(baseUrl + apiPath, method, headers, body);

  if (!result.success) {
    return result; // 网络错误，透传
  }

  // 解析 JSON 响应
  let parsedData;
  try {
    parsedData = JSON.parse(result.data);
  } catch (parseErr) {
    let errMsg = "[doc2x][apiRequest] API 返回内容 JSON 解析失败: " + parseErr.message + "，原始响应: " + result.data.substring(0, 200);
    console.error(errMsg);
    return { success: false, errorCode: 502, error: errMsg };
  }

  // 检查业务层错误码（doc2x API 用 code 字段表示成功/失败，成功值为 "success"）
  if (parsedData.code && parsedData.code !== "success") {
    let errMsg = "[doc2x][apiRequest] Doc2x API 业务错误，code: " + parsedData.code + "，msg: " + (parsedData.msg || "无");
    console.error(errMsg);
    return { success: false, errorCode: 500, error: errMsg };
  }

  return { success: true, data: parsedData.data };
}

// ==================== 步骤 2：上传 PDF 文件到 OSS 预签名 URL ====================

/**
 * 将本地 PDF 文件通过 HTTP PUT 上传到 Doc2x 返回的 OSS 预签名 URL
 * @param {string} uploadUrl - OSS 预签名上传 URL
 * @param {string} filePath - 本地 PDF 文件绝对路径
 * @returns {Promise<{ success: boolean, errorCode?: number, error?: string }>}
 */
function uploadFileToOss(uploadUrl, filePath) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(uploadUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const transport = isHttps ? https : http;

    // 获取文件大小用于 Content-Length
    let fileSize;
    try {
      const stat = fs.statSync(filePath);
      fileSize = stat.size;
    } catch (err) {
      resolve({
        success: false,
        errorCode: 404,
        error: "[doc2x][uploadFileToOss] 错误：无法获取文件信息: " + err.message,
      });
      return;
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": fileSize,
      },
    };

    console.log("[doc2x][uploadFileToOss] 开始上传 PDF 文件，大小: " + (fileSize / 1024 / 1024).toFixed(2) + " MB");

    const req = transport.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => { responseData += chunk.toString(); });
      res.on("end", () => {
        if (res.statusCode === 200) {
          console.log("[doc2x][uploadFileToOss] PDF 文件上传成功。");
          resolve({ success: true });
        } else {
          let errMsg = "[doc2x][uploadFileToOss] 错误：OSS 上传失败，HTTP " + res.statusCode + "，响应: " + responseData.substring(0, 200);
          console.error(errMsg);
          resolve({ success: false, errorCode: 500, error: errMsg });
        }
      });
    });

    req.on("error", (err) => {
      let errMsg = "[doc2x][uploadFileToOss] 错误：上传请求失败: " + err.message;
      console.error(errMsg);
      resolve({ success: false, errorCode: 500, error: errMsg });
    });

    // 上传超时设置为 5 分钟（大文件可能需要较长时间）
    req.setTimeout(300000, () => {
      req.destroy();
      resolve({
        success: false,
        errorCode: 500,
        error: "[doc2x][uploadFileToOss] 错误：文件上传超时（5分钟）。",
      });
    });

    // 流式读取文件并上传（避免大文件占用内存）
    const readStream = fs.createReadStream(filePath);
    readStream.on("error", (err) => {
      let errMsg = "[doc2x][uploadFileToOss] 错误：读取文件失败: " + err.message;
      console.error(errMsg);
      req.destroy();
      resolve({ success: false, errorCode: 500, error: errMsg });
    });

    readStream.pipe(req);
  });
}

// ==================== 步骤 3：轮询解析状态 ====================

/**
 * 轮询 Doc2x 解析任务状态，直到成功或失败
 * @param {string} baseUrl - Doc2x API Base URL
 * @param {string} apiKey - API Key
 * @param {string} uid - 任务 ID
 * @param {number} maxWaitMs - 最大等待时间（默认 15 分钟）
 * @param {number} intervalMs - 轮询间隔（默认 3 秒）
 * @returns {Promise<{ success: boolean, errorCode?: number, error?: string }>}
 */
async function pollParseStatus(baseUrl, apiKey, uid, maxWaitMs, intervalMs) {
  console.log("[doc2x][pollParseStatus] 开始轮询 PDF 解析状态，uid: " + uid);

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await apiRequest(baseUrl, apiKey, "/api/v2/parse/status?uid=" + uid, "GET", null);

    if (!result.success) {
      return result; // API 调用失败，透传错误
    }

    const statusData = result.data;
    const status = statusData.status;

    console.log("[doc2x][pollParseStatus] 解析状态: " + status + "，进度: " + (statusData.progress || 0) + "%");

    if (status === "success") {
      // 获取页数（doc2x API 返回 result.pages 数组，每页一个元素）
      const pages = statusData.result?.pages;
      const pageCount = Array.isArray(pages) ? pages.length : 0;
      console.log("[doc2x][pollParseStatus] PDF 解析完成，页数: " + pageCount);
      return { success: true, pageCount };
    }

    if (status === "failed") {
      let errMsg = "[doc2x][pollParseStatus] 错误：PDF 解析失败，详情: " + (statusData.detail || "未知错误");
      console.error(errMsg);
      return { success: false, errorCode: 500, error: errMsg };
    }

    // 状态为 processing，等待后继续轮询
    await sleep(intervalMs);
  }

  // 超时
  let errMsg = "[doc2x][pollParseStatus] 错误：PDF 解析轮询超时（已等待 " + (maxWaitMs / 1000 / 60).toFixed(1) + " 分钟）。";
  console.error(errMsg);
  return { success: false, errorCode: 500, error: errMsg };
}

// ==================== 步骤 5：轮询导出结果 ====================

/**
 * 轮询 Doc2x 导出任务结果，获取 zip 下载 URL
 * @param {string} baseUrl - Doc2x API Base URL
 * @param {string} apiKey - API Key
 * @param {string} uid - 任务 ID
 * @param {number} maxWaitMs - 最大等待时间（默认 5 分钟）
 * @param {number} intervalMs - 轮询间隔（默认 2 秒）
 * @returns {Promise<{ success: boolean, downloadUrl?: string, errorCode?: number, error?: string }>}
 */
async function pollExportResult(baseUrl, apiKey, uid, maxWaitMs, intervalMs) {
  console.log("[doc2x][pollExportResult] 开始轮询导出结果，uid: " + uid);

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await apiRequest(baseUrl, apiKey, "/api/v2/convert/parse/result?uid=" + uid, "GET", null);

    if (!result.success) {
      return result;
    }

    const exportData = result.data;
    const status = exportData.status;

    console.log("[doc2x][pollExportResult] 导出状态: " + status);

    if (status === "success") {
      // 成功：获取下载 URL（文档提示需替换 \u0026 为 &）
      let downloadUrl = exportData.url || "";
      downloadUrl = downloadUrl.replace(/\\u0026/g, "&");
      console.log("[doc2x][pollExportResult] 导出成功，下载 URL: " + downloadUrl);
      return { success: true, downloadUrl: downloadUrl };
    }

    if (status === "failed") {
      let errMsg = "[doc2x][pollExportResult] 错误：导出失败，详情: " + (exportData.detail || "未知错误");
      console.error(errMsg);
      return { success: false, errorCode: 500, error: errMsg };
    }

    // 状态为 processing
    await sleep(intervalMs);
  }

  // 超时
  let errMsg = "[doc2x][pollExportResult] 错误：导出结果轮询超时（已等待 " + (maxWaitMs / 1000).toFixed(0) + " 秒）。";
  console.error(errMsg);
  return { success: false, errorCode: 500, error: errMsg };
}

// ==================== 核心转换函数 ====================

/**
 * 将本地 PDF 文件通过 Doc2x API 转换为 Markdown 压缩包，返回下载链接
 *
 * 完整流程：
 *   1. 输入校验 → 2. 加载配置 → 3. 预上传获取 URL → 4. 上传文件到 OSS
 *   → 5. 轮询解析状态 → 6. 触发导出 → 7. 轮询导出结果 → 返回下载链接
 *
 * @param {string} localPdfPath - 本地 PDF 文件绝对路径
 * @returns {Promise<{ code: number, downloadUrl?: string, pageCount?: number, message?: string }>}
 *   始终返回对象，不会抛出异常：
 *   - code 200 时 downloadUrl 和 pageCount 有值，可直接使用
 *   - code ≥ 400 时通过 message 了解失败原因
 */
async function main(localPdfPath) {
  console.log("[doc2x][main] ========== 开始 PDF → Markdown 转换 ==========");

  // ========== 第一步：输入校验 ==========
  const validation = validateString(localPdfPath, "localPdfPath", {
    maxLength: 2000,
    required: true,
    checkInjection: false, // 文件路径不需要检查注入攻击
    checkDangerousChars: false, // 文件路径允许合理的特殊字符
    moduleTag: "[doc2x]",
  });
  if (!validation.valid) {
    return { code: 400, message: validation.error };
  }

  // 检查文件是否存在
  const absolutePath = path.resolve(localPdfPath);
  if (!fs.existsSync(absolutePath)) {
    let errMsg = "[doc2x][main] 错误：指定的 PDF 文件不存在 —— " + absolutePath;
    console.error(errMsg);
    return { code: 404, message: errMsg };
  }

  // 检查是否为 PDF 文件（简单通过扩展名判断）
  if (!absolutePath.toLowerCase().endsWith(".pdf")) {
    let errMsg = "[doc2x][main] 错误：文件不是 PDF 格式 —— " + absolutePath;
    console.error(errMsg);
    return { code: 400, message: errMsg };
  }

  console.log("[doc2x][main] 输入验证通过，文件路径: " + absolutePath);

  // ========== 第二步：校验配置完整性 ==========
  // 配置已通过统一入口 config/index.js 加载（敏感字段从 .env 注入）
  if (!doc2xConfig.DOC2X_API_KEY || !doc2xConfig.DOC2X_API_BASE) {
    let errMsg = "[doc2x][main] 错误：Doc2x 配置不完整，缺少 DOC2X_API_KEY 或 DOC2X_API_BASE。";
    console.error(errMsg);
    return { code: 504, message: errMsg };
  }
  if (doc2xConfig.DOC2X_API_KEY === "sk-xxx") {
    let errMsg = "[doc2x][main] 错误：DOC2X_API_KEY 仍为占位符 'sk-xxx'，请在 .env 中填写真实的 API Key。";
    console.error(errMsg);
    return { code: 504, message: errMsg };
  }
  console.log("[doc2x][main] Doc2x 配置校验通过。");
  const { DOC2X_API_KEY, DOC2X_API_BASE } = doc2xConfig;

  // ========== 第三步：预上传（获取 OSS 上传 URL + uid） ==========
  console.log("[doc2x][main] 步骤 1/5：预上传，获取 OSS 上传 URL...");
  const preuploadResult = await apiRequest(DOC2X_API_BASE, DOC2X_API_KEY, "/api/v2/parse/preupload", "POST", {});
  if (!preuploadResult.success) {
    return { code: preuploadResult.errorCode, message: preuploadResult.error };
  }
  const uploadUrl = preuploadResult.data.url;
  const uid = preuploadResult.data.uid;
  console.log("[doc2x][main] 预上传成功，uid: " + uid);

  // ========== 第四步：上传 PDF 文件到 OSS ==========
  console.log("[doc2x][main] 步骤 2/5：上传 PDF 文件到 OSS...");
  const uploadResult = await uploadFileToOss(uploadUrl, absolutePath);
  if (!uploadResult.success) {
    return { code: uploadResult.errorCode, message: uploadResult.error };
  }

  // ========== 第五步：轮询解析状态 ==========
  console.log("[doc2x][main] 步骤 3/5：轮询 PDF 解析状态（最长等待 15 分钟）...");
  const parseResult = await pollParseStatus(DOC2X_API_BASE, DOC2X_API_KEY, uid, 15 * 60 * 1000, 3000);
  if (!parseResult.success) {
    return { code: parseResult.errorCode, message: parseResult.error };
  }
  const pageCount = parseResult.pageCount || 0; // 提取页数，用于后续计费

  // ========== 第六步：触发 Markdown 导出 ==========
  console.log("[doc2x][main] 步骤 4/5：触发 Markdown 导出...");
  const exportBody = {
    uid: uid,
    to: "md",
    formula_mode: "normal",
    filename: "output.md",
  };
  const exportResult = await apiRequest(DOC2X_API_BASE, DOC2X_API_KEY, "/api/v2/convert/parse", "POST", exportBody);
  if (!exportResult.success) {
    return { code: exportResult.errorCode, message: exportResult.error };
  }
  console.log("[doc2x][main] 导出任务已触发。");

  // ========== 第七步：轮询导出结果，获取下载 URL ==========
  console.log("[doc2x][main] 步骤 5/5：轮询导出结果（最长等待 5 分钟）...");
  const dlResult = await pollExportResult(DOC2X_API_BASE, DOC2X_API_KEY, uid, 5 * 60 * 1000, 2000);
  if (!dlResult.success) {
    return { code: dlResult.errorCode, message: dlResult.error };
  }

  // ========== 成功：返回下载链接和页数 ==========
  console.log("[doc2x][main] ========== PDF → Markdown 转换完成 ==========");
  return {
    code: 200,
    downloadUrl: dlResult.downloadUrl,
    pageCount, // 返回页数，供调用方计费
  };
}

// ==================== 模块导出 ====================
module.exports = { convertPdfToMarkdown: main };
