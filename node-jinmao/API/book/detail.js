// ==================== 教材详情路由模块 ====================
// 职责：提供教材详情查询功能（含完整章节列表+所有者权限校验）
// 端点：GET /api/v1/books/:id
// 鉴权：需 Bearer Token（authenticateToken 中间件）

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例

// 导入 JWT 鉴权中间件（路径从 API/book/detail.js 向上两级到项目根目录）
const { authenticateToken } = require("../../middleware/auth");
// 导入 Repository 层：教材数据库操作
const bookRepo = require("../../utils/repo/book_repo");

// 日志前缀
const TAG = "[API_book_detail]";

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/books/{id}:
 *   get:
 *     tags: [教材]
 *     summary: 获取教材详情
 *     description: 根据教材 ID 获取教材的完整详细信息，包含所有章节列表。仅允许教材所有者查看。
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
 *                     id: { type: string, example: "1", description: "教材 ID（BigInt 转 String）" }
 *                     userId: { type: string, example: "1", description: "用户 ID" }
 *                     name: { type: string, example: "职称考试知识点", description: "教材名称" }
 *                     subtitle: { type: string, nullable: true, example: "从零开始掌握核心知识点", description: "教材副标题（AI 生成）" }
 *                     description: { type: string, nullable: true, example: null, description: "教材描述" }
 *                     textbookFilename: { type: string, example: "2025年度职称考试部分主要知识点.md", description: "教材原文件名" }
 *                     textbookPath: { type: string, example: "/usercourse/1/2/教材.md", description: "归一化 MD 在 MinIO 路径" }
 *                     sourcePath: { type: string, example: "/usercourse/1/2/教材.pdf", description: "源文件在 MinIO 路径" }
 *                     coverPath: { type: string, nullable: true, example: null, description: "封面图 MinIO 路径" }
 *                     coverUrl: { type: string, nullable: true, example: "/api/v1/files/usercourse/1/2/cover.png", description: "封面图代理访问 URL（通过后端代理访问 MinIO，无需暴露 MinIO 服务）" }
 *                     elaborationEnabled: { type: boolean, example: true, description: "是否开启文本细化" }
 *                     endline: { type: integer, example: 0, description: "当前已处理到的行号" }
 *                     pipelineStatus: { type: string, example: "processing", description: "流水线状态" }
 *                     createTime: { type: string, format: date-time, example: "2026-07-05T08:50:50.764Z", description: "创建时间" }
 *                     updateTime: { type: string, format: date-time, example: "2026-07-05T08:50:50.764Z", description: "更新时间" }
 *                     chapters:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, example: "1", description: "章节 ID" }
 *                           courseId: { type: string, example: "1", description: "所属课程 ID" }
 *                           sequence: { type: integer, example: 1, description: "章节序号" }
 *                           name: { type: string, example: "第一章 导数与微分", description: "章节名称" }
 *                           description: { type: string, nullable: true, example: null, description: "章节描述" }
 *                           chapterRoot: { type: string, example: "/usercourse/1/2/chapter_01/", description: "MinIO 章节根目录" }
 *                           startline: { type: integer, example: 1, description: "本章起始行号" }
 *                           endline: { type: integer, example: 50, description: "本章结束行号" }
 *                           totalPages: { type: integer, example: 25, description: "PPT 总页数" }
 *                           outlinePath: { type: string, nullable: true, example: "/usercourse/.../chapter_01.json", description: "大纲 JSON 路径" }
 *                           status: { type: string, example: "completed", description: "章节状态" }
 *                           createTime: { type: string, format: date-time, example: "2026-07-05T08:50:50.764Z", description: "创建时间" }
 *                           updateTime: { type: string, format: date-time, example: "2026-07-05T08:50:50.764Z", description: "更新时间" }
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
 * GET /api/v1/books/:id — 获取教材详情（含章节列表+权限校验）
 */
router.get("/books/:id", authenticateToken, async (req, res) => {
  const bookId = req.params.id; // 从 URL 路径参数提取教材 ID
  console.log(TAG + "[GET /books/:id] 收到教材详情请求，bookId: " + bookId + "，userId: " + req.userId);

  try {
    // ========== 1. 参数校验：ID 必须为有效数字字符串 ==========
    // parseInt 将字符串转为整数，再转回字符串比较，确保输入是纯数字
    const parsedId = parseInt(bookId, 10);
    if (isNaN(parsedId) || String(parsedId) !== bookId) {
      console.log(TAG + "[GET /books/:id] 无效的教材 ID 格式: " + bookId);
      return res.status(400).json({
        code: 400,
        message: "教材 ID 格式无效，必须为纯数字。",
        data: null,
      });
    }

    // ========== 2. 调用 Repository 层查询教材详情（含章节列表） ==========
    const result = await bookRepo.getCourseById(bookId);

    // 教材不存在
    if (result.code === 404) {
      console.log(TAG + "[GET /books/:id] 教材不存在，bookId: " + bookId);
      return res.status(404).json({
        code: 404,
        message: "教材不存在。",
        data: null,
      });
    }

    // 其他数据库异常
    if (result.code !== 200) {
      console.log(TAG + "[GET /books/:id] 查询失败: " + result.message);
      return res.status(500).json({
        code: 500,
        message: result.message || "查询教材详情失败。",
        data: null,
      });
    }

    const course = result.course; // 提取课程对象

    // ========== 3. 权限校验：确保教材属于当前用户 ==========
    // BigInt 需转为字符串再比较，防止类型不匹配
    if (String(course.userId) !== String(req.userId)) {
      console.log(TAG + "[GET /books/:id] 越权访问：课程 userId=" + course.userId +
        "，请求 userId=" + req.userId);
      return res.status(403).json({
        code: 403,
        message: "无权访问该教材。",
        data: null,
      });
    }

    // ========== 4. 数据转换：BigInt → String ==========
    // 将课程和章节中的 BigInt 字段转为字符串
    const chapters = (course.chapters || []).map((ch) => ({
      id: String(ch.id), // BigInt → String
      courseId: String(ch.courseId), // BigInt → String
      sequence: ch.sequence,
      name: ch.name,
      description: ch.description || null,
      chapterRoot: ch.chapterRoot,
      startline: ch.startline,
      endline: ch.endline,
      totalPages: ch.totalPages,
      outlinePath: ch.outlinePath || null,
      status: ch.status,
      createTime: ch.createTime,
      updateTime: ch.updateTime,
    }));

    // 构建课程级响应数据
    const courseData = {
      id: String(course.id), // BigInt → String
      userId: String(course.userId), // BigInt → String
      name: course.name,
      subtitle: course.subtitle || null, // 教材副标题（AI 生成）
      description: course.description || null,
      textbookFilename: course.textbookFilename,
      textbookPath: course.textbookPath,
      sourcePath: course.sourcePath,
      coverPath: course.coverPath || null,
      coverUrl: course.coverPath ? "/api/v1/files" + course.coverPath : null, // 【新增】封面图代理访问 URL
      elaborationEnabled: course.elaborationEnabled,
      endline: course.endline,
      pipelineStatus: course.pipelineStatus,
      createTime: course.createTime,
      updateTime: course.updateTime,
      chapters: chapters, // 完整章节列表
    };

    console.log(TAG + "[GET /books/:id] 查询成功，章节数: " + chapters.length);

    // ========== 5. 返回成功响应 ==========
    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: courseData,
    });

  } catch (error) {
    // 捕获未预期的异常
    console.error(TAG + "[GET /books/:id] 处理异常: " + error.message);
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
