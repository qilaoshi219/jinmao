// ==================== 教材列表路由模块 ====================
// 职责：提供教材列表查询功能（分页+关键词搜索）
// 端点：GET /api/v1/books
// 鉴权：需 Bearer Token（authenticateToken 中间件）

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例

// 导入 JWT 鉴权中间件（路径从 API/book/list.js 向上两级到项目根目录）
const { authenticateToken } = require("../../middleware/auth");
// 导入 Repository 层：教材数据库操作
const bookRepo = require("../../utils/repo/book_repo");

// 日志前缀
const TAG = "[API_book_list]";

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/books:
 *   get:
 *     tags: [教材]
 *     summary: 获取用户教材列表
 *     description: 分页查询当前用户的所有教材，支持关键词搜索。返回每项教材的 chapterCount 字段（章节数量），不返回完整章节列表。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码（从 1 开始）
 *       - name: pageSize
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: 每页条数（最大 50）
 *       - name: keyword
 *         in: query
 *         schema:
 *           type: string
 *         description: 搜索关键词（模糊匹配教材名称）
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
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, example: "1", description: "教材 ID（BigInt 转 String）" }
 *                           userId: { type: string, example: "1", description: "用户 ID" }
 *                           name: { type: string, example: "职称考试知识点", description: "教材名称" }
 *                           subtitle: { type: string, nullable: true, example: "从零开始掌握核心知识点", description: "教材副标题（AI 生成）" }
 *                           description: { type: string, nullable: true, example: null, description: "教材描述" }
 *                           textbookFilename: { type: string, example: "2025年度职称考试部分主要知识点.md", description: "教材源文件名（不可修改）" }
 *                           textbookPath: { type: string, example: "/usercourse/1/2/教材.md", description: "归一化 MD 在 MinIO 路径" }
 *                           sourcePath: { type: string, example: "/usercourse/1/2/教材.pdf", description: "源文件在 MinIO 路径" }
 *                           coverPath: { type: string, nullable: true, example: "/usercourse/1/2/cover.png", description: "封面图 MinIO 路径" }
  *                           coverUrl: { type: string, nullable: true, example: "/api/v1/files/usercourse/1/2/cover.png", description: "封面图代理访问 URL（通过后端代理访问 MinIO，无需暴露 MinIO 服务）" }
 *                           elaborationEnabled: { type: boolean, example: true, description: "是否开启文本细化" }
 *                           endline: { type: integer, example: 0, description: "当前已处理到的行号" }
 *                           pipelineStatus: { type: string, example: "processing", description: "流水线状态" }
 *                           createTime: { type: string, format: date-time, example: "2026-07-05T08:50:50.764Z", description: "创建时间" }
 *                           updateTime: { type: string, format: date-time, example: "2026-07-05T08:50:50.764Z", description: "更新时间" }
 *                           chapterCount: { type: integer, example: 0, description: "章节数量" }
 *                     total: { type: integer, example: 2, description: "总记录数" }
 *                     page: { type: integer, example: 1, description: "当前页码" }
 *                     pageSize: { type: integer, example: 10, description: "每页条数" }
 *       401:
 *         description: 未认证 / Token 无效或已过期
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "Token 无效，请重新登录。" }
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
 * GET /api/v1/books — 获取用户教材列表（分页+搜索）
 *
 * 查询参数：
 *   - page: 页码（默认 1）
 *   - pageSize: 每页条数（默认 10，最大 50）
 *   - keyword: 搜索关键词（可选）
 */
router.get("/books", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET /books] 收到教材列表请求，userId: " + req.userId);

  try {
    // ========== 1. 解析查询参数并设置默认值 ==========
    // 页码：从 query 中读取，默认为 1，必须是正整数
    let page = parseInt(req.query.page, 10);
    if (isNaN(page) || page < 1) {
      page = 1; // 无效页码回退为默认值
    }

    // 每页条数：从 query 中读取，默认为 10，上限 50
    let pageSize = parseInt(req.query.pageSize, 10);
    if (isNaN(pageSize) || pageSize < 1) {
      pageSize = 10; // 无效条数回退为默认值
    }
    if (pageSize > 50) {
      pageSize = 50; // 超过上限则限制为 50
    }

    // 搜索关键词：可选，用于模糊匹配教材名称
    const keyword = req.query.keyword || undefined;

    console.log(TAG + "[GET /books] 查询参数: page=" + page + ", pageSize=" + pageSize +
      (keyword ? ", keyword=" + keyword : ""));

    // ========== 2. 调用 Repository 层分页查询 ==========
    const result = await bookRepo.listCoursesByUser(req.userId, page, pageSize, keyword);

    // Repository 层返回非 200 视为异常
    if (result.code !== 200) {
      console.log(TAG + "[GET /books] 查询失败: " + result.message);
      return res.status(500).json({
        code: 500,
        message: result.message || "查询教材列表失败。",
        data: null,
      });
    }

    // ========== 3. 数据转换：BigInt → String + 扁平化 ==========
    // 将课程数据中的 BigInt 字段转为字符串，防止前端精度丢失
    const items = result.data.items.map((course) => ({
      id: String(course.id), // BigInt → String
      userId: String(course.userId), // BigInt → String
      name: course.name, // 教材名称（可被 AI 生成/用户手动修改）
      subtitle: course.subtitle || null, // 教材副标题（AI 生成）
      description: course.description || null,
      textbookFilename: course.textbookFilename, // 教材源文件名（不可修改）
      textbookPath: course.textbookPath,
      sourcePath: course.sourcePath,
      coverPath: course.coverPath || null, // 封面图 MinIO 路径
      coverUrl: course.coverPath ? "/api/v1/files" + course.coverPath : null, // 封面图代理访问 URL
      elaborationEnabled: course.elaborationEnabled,
      endline: course.endline,
      pipelineStatus: course.pipelineStatus,
      createTime: course.createTime, // 数据库 datetime → JSON 自动转换
      updateTime: course.updateTime,
      chapterCount: (course.chapters && course.chapters.length) || 0, // 章节数量（不返回完整列表）
    }));

    console.log(TAG + "[GET /books] 查询成功，共 " + result.data.total + " 条，本页 " + items.length + " 条");

    // ========== 4. 返回成功响应 ==========
    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: {
        items: items,
        total: result.data.total,
        page: result.data.page,
        pageSize: result.data.pageSize,
      },
    });

  } catch (error) {
    // 捕获未预期的异常
    console.error(TAG + "[GET /books] 处理异常: " + error.message);
    console.error(error.stack);
    return res.status(500).json({
      code: 500,
      message: "服务器内部错误: " + error.message,
      data: null,
    });
  }
});

// 导出路由实例，供 index.js 合并
module.exports = router;
