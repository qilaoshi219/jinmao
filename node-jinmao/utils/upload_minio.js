// 本模块负责将本地文件上传到 MinIO 对象存储
// 输入：本地文件路径 + MinIO 目标路径（如 /usercourse/{userid}/{bookid}/）
// 输出：上传成功后的 MinIO 文件 URL
// 返回值格式：{ code: number, url?: string, message?: string }
//   code 200 — 上传成功，返回 url
//   code 400 — 输入参数不合法（路径为空/类型错误）
//   code 404 — 指定的本地文件不存在
//   code 500 — 上传过程失败（网络错误/MinIO 服务不可用）
//   code 504 — 配置加载失败（MinIO 配置不存在或格式错误）
// 依赖：minio npm 包，需配置 MinIO 连接信息（endpoint / accessKey / secretKey / bucket）

const fs = require("fs");
const path = require("path");
const { Client } = require("minio");

// ==================== 加载环境变量 ====================
// 主动加载 dotenv，确保无论通过何种方式引入此模块，都能读取 .env 中的配置
try {
  require("dotenv").config({
    path: path.resolve(__dirname, "..", ".env"), // 指向 node-jinmao 根目录的 .env
    override: true, // .env 为权威配置源
  });
} catch (e) {
  // dotenv 可能未安装，忽略加载失败
}

// ==================== 配置文件路径常量 ====================
// JSON 配置文件作为后备方案，当环境变量未配置时使用
const CONFIG_PATH = path.join(__dirname, "..", "config", "minio_config.json");

// ==================== 输入校验函数 ====================

/**
 * 校验输入参数的合法性
 * 检查内容：
 *   1. localPath 不能为空、必须为字符串
 *   2. minioPath 不能为空、必须为字符串
 *   3. 本地文件是否存在
 * @param {string} localPath - 本地文件路径
 * @param {string} minioPath - MinIO 目标路径（含文件名，如 /usercourse/1001/2001/文件.pdf）
 * @returns {{ valid: boolean, errorCode?: number, error?: string }}
 */
function validateInput(localPath, minioPath) {
  if (!localPath || typeof localPath !== "string") {
    let errMsg = "[upload_minio][validateInput] 错误：本地文件路径(localPath)不能为空且必须为字符串类型。";
    console.error(errMsg);
    return { valid: false, errorCode: 400, error: errMsg };
  }
  if (!minioPath || typeof minioPath !== "string") {
    let errMsg = "[upload_minio][validateInput] 错误：MinIO 目标路径(minioPath)不能为空且必须为字符串类型。";
    console.error(errMsg);
    return { valid: false, errorCode: 400, error: errMsg };
  }

  const absolutePath = path.resolve(localPath);
  if (!fs.existsSync(absolutePath)) {
    let errMsg = "[upload_minio][validateInput] 错误：文件不存在 —— " + absolutePath;
    console.error(errMsg);
    return { valid: false, errorCode: 404, error: errMsg };
  }

  console.log("[upload_minio][validateInput] 输入验证通过，本地文件: " + absolutePath + "，目标: " + minioPath);
  return { valid: true };
}

// ==================== 配置文件加载函数 ====================

/**
 * 加载 MinIO 配置（优先从环境变量读取，JSON 配置文件作为后备）
 * 
 * 优先级：
 *   1. 环境变量（.env 文件）：MINIO_ENDPOINT / MINIO_PORT / MINIO_USE_SSL / MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_BUCKET
 *   2. JSON 配置文件（config/minio_config.json）：当环境变量缺失时使用
 * 
 * @returns {{ success: boolean, config?: object, errorCode?: number, error?: string, source?: string }}
 */
function loadConfig() {
  // ==================== 方案一：从环境变量读取 ====================
  const envEndpoint = process.env.MINIO_ENDPOINT;
  const envPort = process.env.MINIO_PORT;
  const envAccessKey = process.env.MINIO_ACCESS_KEY;
  const envSecretKey = process.env.MINIO_SECRET_KEY;
  const envBucket = process.env.MINIO_BUCKET;

  // 检查环境变量是否全部配置（至少需要 endpoint、accessKey、secretKey、bucket）
  if (envEndpoint && envAccessKey && envSecretKey && envBucket) {
    const config = {
      endpoint: envEndpoint,
      port: parseInt(envPort) || 9000,           // 端口默认 9000
      useSSL: process.env.MINIO_USE_SSL === "true", // SSL 默认关闭
      accessKey: envAccessKey,
      secretKey: envSecretKey,
      bucket: envBucket,
    };
    console.log("[upload_minio][loadConfig] 配置来源：环境变量 (.env)，端口: " + config.port);
    return { success: true, config: config, source: "env" };
  }

  // ==================== 方案二：从 JSON 配置文件读取（后备方案） ====================
  console.log("[upload_minio][loadConfig] 环境变量不完整，尝试从 JSON 配置文件加载...");
  
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      let errMsg = "[upload_minio][loadConfig] 错误：配置文件不存在，路径: " + CONFIG_PATH;
      console.error(errMsg);
      return { success: false, errorCode: 504, error: errMsg };
    }

    const rawConfig = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(rawConfig);

    if (!config.endpoint || !config.accessKey || !config.secretKey || !config.bucket) {
      let errMsg = "[upload_minio][loadConfig] 错误：配置文件中缺少 endpoint / accessKey / secretKey / bucket。";
      console.error(errMsg);
      return { success: false, errorCode: 504, error: errMsg };
    }

    console.log("[upload_minio][loadConfig] 配置来源：JSON 配置文件，端口: " + (config.port || 9000));
    return { success: true, config: config, source: "json" };
  } catch (err) {
    let errMsg = "[upload_minio][loadConfig] 错误：配置文件读取或解析失败: " + err.message;
    console.error(errMsg);
    return { success: false, errorCode: 504, error: errMsg };
  }
}

// ==================== Bucket 自动创建函数 ====================

/**
 * 确保指定的 MinIO bucket 存在，不存在则自动创建
 * @param {Object} minioClient - MinIO 客户端实例
 * @param {string} bucketName - bucket 名称
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function ensureBucket(minioClient, bucketName) {
  try {
    // 检查 bucket 是否已存在
    const exists = await minioClient.bucketExists(bucketName);
    if (exists) {
      console.log("[upload_minio][ensureBucket] bucket 已存在: " + bucketName);
      return { success: true };
    }

    // bucket 不存在，自动创建
    console.log("[upload_minio][ensureBucket] bucket 不存在，正在创建: " + bucketName);
    await minioClient.makeBucket(bucketName);
    console.log("[upload_minio][ensureBucket] bucket 创建成功: " + bucketName);
    return { success: true };
  } catch (err) {
    let errMsg = "[upload_minio][ensureBucket] 错误：bucket 检查/创建失败: " + err.message;
    console.error(errMsg);
    return { success: false, error: errMsg };
  }
}

// ==================== 核心上传函数 ====================

/**
 * 将本地文件上传到 MinIO 对象存储
 * @param {string} localPath - 本地文件路径
 * @param {string} minioPath - MinIO 目标路径（如 /usercourse/{userid}/{bookid}/文件.pdf）
 * @returns {Promise<{ code: number, url?: string, message?: string }>}
 */
async function upload(localPath, minioPath) {
  console.log("[upload_minio][upload] ========== 开始上传到 MinIO ==========");

  // 第一步：输入校验
  const validation = validateInput(localPath, minioPath);
  if (!validation.valid) {
    return { code: validation.errorCode, message: validation.error };
  }

  // 第二步：加载配置
  const configResult = loadConfig();
  if (!configResult.success) {
    return { code: configResult.errorCode, message: configResult.error };
  }

  const config = configResult.config;
  const absolutePath = path.resolve(localPath);

  // 第三步：创建 MinIO 客户端并上传
  try {
    const minioClient = new Client({
      endPoint: config.endpoint,
      port: config.port || 9000,
      useSSL: config.useSSL !== false,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });

    // 确保 bucket 存在（不存在则自动创建）
    const bucketResult = await ensureBucket(minioClient, config.bucket);
    if (!bucketResult.success) {
      return { code: 500, message: bucketResult.error };
    }

    // 规范化 MinIO 路径（去掉开头的 /）
    const objectName = minioPath.replace(/^\/+/, "");

    console.log("[upload_minio][upload] 上传文件: " + absolutePath + " → " + objectName);

    // 上传文件
    await minioClient.fPutObject(config.bucket, objectName, absolutePath);

    // 拼接文件访问 URL
    const protocol = config.useSSL !== false ? "https" : "http";
    const portStr = (config.port && config.port !== 443 && config.port !== 80) ? (":" + config.port) : "";
    const url = protocol + "://" + config.endpoint + portStr + "/" + config.bucket + "/" + objectName;

    console.log("[upload_minio][upload] 上传成功，URL: " + url);
    return { code: 200, url: url };
  } catch (err) {
    let errMsg = "[upload_minio][upload] 错误：MinIO 上传失败: " + err.message;
    console.error(errMsg);
    return { code: 500, message: errMsg };
  }
}

// ==================== 模块导出 ====================
module.exports = { upload, validateInput };
