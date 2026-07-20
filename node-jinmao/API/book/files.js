// ==================== 教材文件列表路由模块 ====================
// 职责：提供教材在 MinIO 中存储的所有文件列表查询功能
// 端点：GET /api/v1/books/:id/files
// 鉴权：需 Bearer Token（authenticateToken 中间件）
//
// 说明：此为临时测试功能，未来会删除。代码独立不耦合，删除时仅需移除本文件及 index.js 中的注册行。

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例
const path = require("path"); // 路径处理
const { Client } = require("minio"); // MinIO 客户端

// 导入 JWT 鉴权中间件（路径从 API/book/files.js 向上两级到项目根目录）
const { authenticateToken } = require("../../middleware/auth");
// 导入 Repository 层：教材数据库操作
const bookRepo = require("../../utils/repo/book_repo");

// 日志前缀
const TAG = "[API_book_files]";

// ==================== 加载环境变量 ====================
try {
  require("dotenv").config({
    path: path.resolve(__dirname, "..", "..", ".env"), // 指向 node-jinmao 根目录的 .env
    override: true, // .env 为权威配置源
  });
} catch (e) {
  // dotenv 加载失败不阻塞启动
}

// ==================== 创建 MinIO 客户端 ====================
const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

// MinIO bucket 名称
const BUCKET = process.env.MINIO_BUCKET || "jinmao";

console.log(TAG + " MinIO 客户端已初始化: endpoint=" + (process.env.MINIO_ENDPOINT || "127.0.0.1") +
  ", bucket=" + BUCKET);

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/books/{id}/files:
 *   get:
 *     tags: [教材]
 *     summary: 获取教材文件列表
 *     description: 列出教材在 MinIO 中存储的所有文件（递归列出子目录）。此为临时测试接口。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 教材 ID（纯数字）
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "查询成功" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     courseId: { type: string, example: "1", description: "教材 ID" }
 *                     courseName: { type: string, example: "职称考试知识点", description: "教材名称" }
 *                     directoryPrefix: { type: string, example: "/usercourse/1/2/", description: "MinIO 目录前缀" }
 *                     totalFiles: { type: integer, example: 5, description: "文件总数" }
 *                     files:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name: { type: string, example: "教材.md", description: "文件名（相对路径）" }
 *                           fullPath: { type: string, example: "/usercourse/1/2/教材.md", description: "MinIO 完整路径" }
 *                           size: { type: integer, example: 2048, description: "文件大小（字节）" }
 *                           sizeFormatted: { type: string, example: "2.00 KB", description: "格式化文件大小" }
 *                           lastModified: { type: string, example: "2026-07-10T08:00:00.000Z", description: "最后修改时间（ISO 8601）" }
 *       400:
 *         description: 教材 ID 格式无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "教材 ID 格式无效，必须为纯数字。" }
 *       401:
 *         description: 未认证 / Token 无效或已过期
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "Token 无效，请重新登录。" }
 *       403:
 *         description: 无权访问（教材不属于当前用户）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 403 }
 *                 message: { type: string, example: "无权访问该教材。" }
 *       404:
 *         description: 教材不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string, example: "教材不存在。" }
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string, example: "服务器内部错误，请稍后再试。" }
 */

/**
 * GET /api/v1/books/:id/files — 获取教材文件列表
 */
router.get("/books/:id/files", authenticateToken, async (req, res) => {
  const bookId = req.params.id; // 从 URL 路径参数提取教材 ID
  console.log(TAG + "[GET /books/:id/files] 收到文件列表请求，bookId: " + bookId + "，userId: " + req.userId);

  try {
    // ========== 1. 参数校验：ID 必须为有效数字字符串 ==========
    const parsedId = parseInt(bookId, 10);
    if (isNaN(parsedId) || String(parsedId) !== bookId) {
      console.log(TAG + "[GET /books/:id/files] 无效的教材 ID 格式: " + bookId);
      return res.status(400).json({
        code: 400,
        message: "教材 ID 格式无效，必须为纯数字。",
        data: null,
      });
    }

    // ========== 2. 查询教材信息 ==========
    const result = await bookRepo.getCourseById(bookId);

    // 教材不存在
    if (result.code === 404) {
      console.log(TAG + "[GET /books/:id/files] 教材不存在，bookId: " + bookId);
      return res.status(404).json({
        code: 404,
        message: "教材不存在。",
        data: null,
      });
    }

    // 其他数据库异常
    if (result.code !== 200) {
      console.log(TAG + "[GET /books/:id/files] 查询失败: " + result.message);
      return res.status(500).json({
        code: 500,
        message: result.message || "查询教材详情失败。",
        data: null,
      });
    }

    const course = result.course;

    // ========== 3. 权限校验：确保教材属于当前用户 ==========
    if (String(course.userId) !== String(req.userId)) {
      console.log(TAG + "[GET /books/:id/files] 越权访问：课程 userId=" + course.userId +
        "，请求 userId=" + req.userId);
      return res.status(403).json({
        code: 403,
        message: "无权访问该教材。",
        data: null,
      });
    }

    // ========== 4. 构建课程根目录 MinIO 路径前缀 ==========
    // 教材的所有文件（源文件、封面图、归一化 MD、章节目录）都在课程根目录下：
    //   /usercourse/{userId}/{courseId}/
    // 不使用 textbookPath 提取目录是因为 textbookPath 指向归一化产物子目录，
    // 不在课程根级别（如 /usercourse/1/42/教材-时间戳-随机串/output.md）
    const courseRootPath = "/usercourse/" + String(course.userId) + "/" + String(course.id) + "/";

    console.log(TAG + "[GET /books/:id/files] textbookPath: " + (course.textbookPath || "无") +
      "，课程根目录: " + courseRootPath);

    // ========== 5. 使用 MinIO listObjects 递归列出目录下所有文件 ==========
    // 去掉开头的 /（MinIO 对象名不以 / 开头）
    const prefix = courseRootPath.replace(/^\/+/, "");

    console.log(TAG + "[GET /books/:id/files] 开始列出 MinIO 文件: bucket=" + BUCKET + "，prefix=" + prefix);

    // MinIO listObjects 返回流（stream），需要手动收集所有对象
    const objectsStream = minioClient.listObjects(BUCKET, prefix, true); // recursive=true
    const files = [];

    // 使用 Promise 包装流式读取
    await new Promise((resolve, reject) => {
      objectsStream.on("data", (obj) => {
        // obj 属性：name, size, lastModified, etag
        if (obj.name) {
          // 计算相对路径（去掉目录前缀）
          const relativePath = obj.name.startsWith(prefix)
            ? obj.name.substring(prefix.length)
            : obj.name;
          // 跳过目录占位对象（空 name 或 name 以 / 结尾且 size 为 0）
          if (!relativePath || relativePath === "") {
            // 这是目录本身，跳过
            return;
          }

          files.push({
            name: relativePath, // 相对路径（如：教材.md、chapter_01/chapter_01.json）
            fullPath: "/" + obj.name, // MinIO 完整路径（如：/usercourse/1/2/教材.md）
            size: obj.size || 0, // 文件大小（字节）
            sizeFormatted: formatFileSize(obj.size || 0), // 格式化大小（如：2.00 KB）
            lastModified: obj.lastModified ? obj.lastModified.toISOString() : null, // ISO 8601 格式
          });
        }
      });

      objectsStream.on("error", (err) => {
        console.error(TAG + "[GET /books/:id/files] MinIO listObjects 错误: " + err.message);
        reject(err);
      });

      objectsStream.on("end", () => {
        console.log(TAG + "[GET /books/:id/files] MinIO 列表完成，文件数: " + files.length);
        resolve();
      });
    });

    // ========== 6. 构建响应 ==========
    console.log(TAG + "[GET /books/:id/files] 查询成功，共 " + files.length + " 个文件");

    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: {
        courseId: String(course.id),
        courseName: course.name,
        directoryPrefix: courseRootPath, // MinIO 课程根目录前缀
        totalFiles: files.length, // 文件总数
        files: files, // 文件列表
      },
    });

  } catch (error) {
    // 捕获未预期的异常
    console.error(TAG + "[GET /books/:id/files] 处理异常: " + error.message);
    console.error(error.stack);
    return res.status(500).json({
      code: 500,
      message: "服务器内部错误: " + error.message,
      data: null,
    });
  }
});

// ==================== 工具函数 ====================

/**
 * 格式化文件大小为人类可读的字符串
 * @param {number} bytes - 文件大小（字节）
 * @returns {string} 格式化后的字符串（如 "2.00 KB"、"1.50 MB"）
 */
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B"; // 0 字节直接返回
  const units = ["B", "KB", "MB", "GB", "TB"]; // 文件大小单位
  const k = 1024; // 每个单位的倍数是 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k)); // 确定使用哪个单位
  const size = (bytes / Math.pow(k, i)).toFixed(2); // 保留两位小数
  return size + " " + units[i]; // 拼接单位和数值
}

// ==================== 模块导出 ====================
// 导出路由实例，供 index.js 合并
module.exports = router;
