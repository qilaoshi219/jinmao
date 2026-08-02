// ==================== 文件代理路由模块 ====================
// 职责：代理访问 MinIO 文件，前端通过 /api/v1/files/{path} 访问
// 端点：GET /api/v1/files/{path}
// 鉴权：无需鉴权（公开接口）
//
// 设计说明：
//   - 不直接暴露 MinIO 服务到公网，通过后端代理访问
//   - 使用流式传输（pipe），不占用服务器内存
//   - 通过文件扩展名自动设置 Content-Type
//   - 不引入新 npm 依赖（MIME 类型使用内置映射表）

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例
const { Client } = require("minio"); // MinIO 客户端
const path = require("path"); // 路径处理

// 日志前缀
const TAG = "[API_files]";

// 加载 dotenv，确保能读取 .env 中的 MinIO 配置
try {
  require("dotenv").config({
    path: path.resolve(__dirname, "..", ".env"), // 指向 node-jinmao 根目录的 .env 文件
    override: true, // .env 为准
  });
} catch (e) {
  // dotenv 加载失败不阻塞启动（config/index.js 已加载）
}

// ==================== 创建 MinIO 客户端 ====================
// 使用 .env 中的 MinIO 配置，与 upload_minio.js 保持一致
const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

// MinIO bucket 名称
const BUCKET = process.env.MINIO_BUCKET || "jinmao";

// ==================== MIME 类型映射表 ====================
// 基于文件扩展名判断 Content-Type，无需引入 mime-types 等额外 npm 包
const MIME_TYPES = {
  ".png": "image/png",       // PNG 图片
  ".jpg": "image/jpeg",      // JPEG 图片
  ".jpeg": "image/jpeg",     // JPEG 图片（别名）
  ".gif": "image/gif",       // GIF 图片
  ".webp": "image/webp",     // WebP 图片
  ".svg": "image/svg+xml",   // SVG 矢量图
  ".pdf": "application/pdf",  // PDF 文档
  ".json": "application/json", // JSON 数据
  ".mp3": "audio/mpeg",      // MP3 音频
  ".wav": "audio/wav",       // WAV 音频
  ".srt": "text/plain",      // SRT 字幕
  ".vtt": "text/vtt",        // VTT 字幕
  ".md": "text/markdown",    // Markdown 文档
  ".txt": "text/plain",      // 纯文本
  ".html": "text/html",      // HTML 文件
};

// ==================== MinIO 客户端连接信息输出 ====================
console.log(TAG + " MinIO 客户端已初始化: endpoint=" + (process.env.MINIO_ENDPOINT || "127.0.0.1") +
  ", port=" + (process.env.MINIO_PORT || "9000") +
  ", bucket=" + BUCKET +
  ", useSSL=" + (process.env.MINIO_USE_SSL === "true"));

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/files/{path}:
 *   get:
 *     tags: [文件]
 *     summary: 代理访问 MinIO 文件
 *     description: 通过后端代理访问 MinIO 中的文件，无需暴露 MinIO 服务。前端用于《img src》等直接引用场景。
 *     parameters:
 *       - name: path
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: MinIO 文件路径（如 usercourse/1/1/cover.png）
 *     responses:
 *       200:
 *         description: 文件内容（二进制流）
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: 文件路径无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "文件路径不能为空。" }
 *       404:
 *         description: 文件不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string, example: "文件不存在。" }
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string, example: "文件读取失败。" }
 */
// ==================== URL 规范化正则（用于修复幻灯片 HTML 中的图片绝对 URL） ====================
// AI 生成的幻灯片 HTML 可能包含绝对 URL（如 https://jinmao.ckstu.top:30080/api/v1/files/...），
// 导致浏览器用 HTTPS 协议直连 30080 端口（该端口仅 HTTP），报 ERR_SSL_PROTOCOL_ERROR。
// 此处将所有指向本服务的绝对 URL（/api/v1/files/）替换为相对路径，确保走同域代理。
//
// 策略：单一全局正则直接匹配 http(s)://任意域名/api/v1/files/ 并替换为 /api/v1/files/
// 无论 URL 出现在什么上下文（HTML src/href 属性、CSS url()、有无引号），一律替换

/** 全局替换：匹配任何位置的 http(s)://域名/api/v1/files/ → /api/v1/files/ */
const ABSOLUTE_FILES_REGEX = /https?:\/\/[^\/"'\s>]+\/api\/v1\/files\//gi;

/** 匹配 <base href="https://..."> 标签 —— DeepSeek 有时会在幻灯片 HTML 中添加 base 标签，
 *  导致浏览器将相对路径 /api/v1/files/... 解析为 https://域名/api/v1/files/... */
const BASE_TAG_REGEX = /<base\s+[^>]*href\s*=\s*["']https?:\/\/[^"']*["'][^>]*>/gi;

/**
 * 规范化 HTML 文件中的绝对图片 URL 为相对路径
 * 将 AI 生成的绝对 URL（如 https://domain:30080/api/v1/files/...）
 * 替换为相对路径（/api/v1/files/...），确保图片走同域代理
 * 同时移除或修复 <base> 标签（DeepSeek 可能添加，导致相对路径被解析为绝对地址）
 * @param {string} htmlContent - 原始 HTML 内容
 * @returns {string} 规范化后的 HTML 内容
 */
function normalizeFileUrls(htmlContent) {
  const originalLength = htmlContent.length;
  let matchCount = 0;

  // Step 0：检测并移除 <base> 标签 —— 这是最隐蔽的 bug 来源：
  //   如果 HTML 中有 <base href="https://jinmao.ckstu.top:30080/">，
  //   即使所有 <img src="/api/v1/files/..."> 都是相对路径，
  //   浏览器也会将其解析为 https://jinmao.ckstu.top:30080/api/v1/files/... → ERR_SSL_PROTOCOL_ERROR
  let result = htmlContent.replace(BASE_TAG_REGEX, (match) => {
    console.log(TAG + " [诊断] ⚠️ 检测到 <base> 标签，已移除: " + match);
    return ""; // 移除整个 <base> 标签
  });

  // Step 1：规范化所有 http(s)://域名/api/v1/files/ 为 /api/v1/files/
  result = result.replace(ABSOLUTE_FILES_REGEX, (match) => {
    matchCount++;
    // 诊断日志：首次匹配时打印示例（仅前3条，避免刷屏）
    if (matchCount <= 3) {
      console.log(TAG + " [诊断] 规范化匹配 #" + matchCount + ": " + match.substring(0, 100));
    }
    return "/api/v1/files/";
  });

  if (matchCount > 0) {
    console.log(TAG + " 已规范化 " + matchCount + " 处绝对 URL 为相对路径（原始 " + originalLength + " 字符 → " + result.length + " 字符）");
    if (matchCount > 3) {
      console.log(TAG + "   ...共 " + matchCount + " 处匹配（仅显示前 3 条）");
    }
    console.log(TAG + " [诊断] 规范化前（前200字符）: " + htmlContent.substring(0, 200));
    console.log(TAG + " [诊断] 规范化后（前200字符）: " + result.substring(0, 200));
  } else {
    console.log(TAG + " [诊断] ⚠️ 未找到任何需规范化的绝对 URL！HTML 前200字符: " + htmlContent.substring(0, 200));
  }

  return result;
}

// 使用通配符 /* 匹配任意深度的文件路径
router.get("/*", async (req, res) => {
  // req.params[0] 在 Express router.get("/*") 中可能带前导 /，统一 strip 掉
  const rawPath = req.params[0];
  const filePath = rawPath.replace(/^\/+/, ""); // 去掉开头所有 /（防御性处理）
  console.log(TAG + " 代理请求: " + filePath + "（原始: " + rawPath + "）");

  // 路径为空
  if (!filePath) {
    return res.status(400).json({ code: 400, message: "文件路径不能为空。" });
  }

  try {
    // 先检查文件是否存在（statObject 当文件不存在时会抛出异常）
    await minioClient.statObject(BUCKET, filePath);

    // 获取文件流（getObject 返回可读流）
    const fileStream = await minioClient.getObject(BUCKET, filePath);

    // 设置 Content-Type（根据文件扩展名从内置映射表查找）
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    // 设置浏览器缓存策略（图片等静态资源缓存 1 天，HTML 不缓存以确保 URL 规范化生效）
    const isHtml = (contentType === "text/html");
    if (isHtml) {
      res.setHeader("Cache-Control", "no-cache"); // HTML 不缓存，确保客户端始终获取最新版本
    } else {
      res.setHeader("Cache-Control", "public, max-age=86400"); // 图片/音频等静态资源缓存 1 天
    }

    // HTML 文件：读取完整内容并规范化 URL 后再发送（因为 AI 可能生成绝对 URL）
    if (isHtml) {
      // 读取文件流到内存（幻灯片 HTML 通常 < 500KB，内存开销可忽略）
      const chunks = [];
      fileStream.on("data", (chunk) => chunks.push(chunk));
      fileStream.on("end", () => {
        const rawContent = Buffer.concat(chunks).toString("utf-8");
        const normalizedContent = normalizeFileUrls(rawContent);
        res.send(normalizedContent);
        console.log(TAG + " 文件代理成功（HTML 已规范化）: " + filePath + " (" + contentType + ")");
      });
      fileStream.on("error", (err) => {
        console.error(TAG + " 文件流读取错误: " + err.message);
        if (!res.headersSent) {
          res.status(500).json({ code: 500, message: "文件读取失败。" });
        }
      });
      return; // HTML 文件已手动处理，不再走 pipe
    }

    // 非 HTML 文件：流式 pipe 到 HTTP 响应流，不占用服务器内存
    fileStream.pipe(res);

    console.log(TAG + " 文件代理成功: " + filePath + " (" + contentType + ")");
  } catch (error) {
    // 文件不存在（MinIO 返回 NoSuchKey 或 NotFound）
    if (error.code === "NoSuchKey" || error.code === "NotFound") {
      console.log(TAG + " 文件不存在: bucket=" + BUCKET + ", key=" + filePath);
      console.log(TAG + " 完整错误: code=" + error.code + ", message=" + error.message);
      return res.status(404).json({ code: 404, message: "文件不存在。" });
    }

    // 其他 MinIO 错误（网络问题、配置错误等）
    console.error(TAG + " 文件代理错误: " + error.message);
    console.error(TAG + " 错误详情: code=" + error.code + ", bucket=" + BUCKET + ", key=" + filePath);
    console.error(error.stack);
    return res.status(500).json({ code: 500, message: "文件读取失败。" });
  }
});

// ==================== 模块导出 ====================
module.exports = router;
