// ==================== 文件补全路由模块 ====================
// 职责：
//   1. POST /api/v1/courses/:courseId/chapters/:chapterId/fix-missing — 触发文件补全
//   2. GET  /api/v1/courses/:courseId/chapters/:chapterId/fix-status — 查询补全状态
// 用于 partial_completed 状态的章节自动检测并补全缺失的 PPT/MP3/SRT 文件

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例

// 导入文件补全函数
const { fixMissingFilesForChapter, getFixStatus } = require("../../service/course_pipeline");
// 导入 Repository 层
const bookRepo = require("../../utils/repo/book_repo"); // 课程数据查询（权限校验）
// 导入 JWT 鉴权中间件
const { authenticateToken } = require("../../middleware/auth");

// 日志前缀
const TAG = "[API_fix_missing]";

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/courses/{courseId}/chapters/{chapterId}/fix-missing:
 *   post:
 *     tags: [章节]
 *     summary: 触发文件补全
 *     description: |
 *       检测章节下 PPT/MP3/SRT 文件的完整性，对缺失文件进行异步补全。
 *       同一章节同时只允许一个补全任务（通过内存去重防止重复）。
 *       补全完成后自动更新章节状态为 completed（如全部成功）。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 课程 ID（纯数字）
 *       - name: chapterId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 章节 ID（纯数字）
 *     responses:
 *       200:
 *         description: 补全任务已启动
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "文件补全任务已启动" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     status: { type: string, example: "fixing" }
 *                     missingFiles:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: ID 格式无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "课程 ID 格式无效" }
 *       401:
 *         description: 未认证
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "Token 无效" }
 *       403:
 *         description: 无权访问
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 403 }
 *                 message: { type: string, example: "无权访问该课程" }
 *       404:
 *         description: 课程或章节不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string, example: "课程不存在" }
 *       409:
 *         description: 已有补全任务进行中
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 409 }
 *                 message: { type: string, example: "该章节已有文件补全任务在进行中" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     status: { type: string, example: "already_fixing" }
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string, example: "服务器内部错误" }
 */

/**
 * POST /api/v1/courses/:courseId/chapters/:chapterId/fix-missing — 触发文件补全
 */
router.post("/courses/:courseId/chapters/:chapterId/fix-missing", authenticateToken, async (req, res) => {
  const { courseId, chapterId } = req.params; // 从 URL 路径参数提取课程 ID 和章节 ID
  console.log(TAG + "[POST] 收到文件补全请求，courseId: " + courseId + "，chapterId: " + chapterId + "，userId: " + req.userId);

  try {
    // ========== 1. 参数校验 ==========
    const parsedCourseId = parseInt(courseId, 10);
    if (isNaN(parsedCourseId) || String(parsedCourseId) !== courseId) {
      console.log(TAG + "[POST] 无效的课程 ID 格式: " + courseId);
      return res.status(400).json({ code: 400, message: "课程 ID 格式无效，必须为纯数字。", data: null });
    }

    const parsedChapterId = parseInt(chapterId, 10);
    if (isNaN(parsedChapterId) || String(parsedChapterId) !== chapterId) {
      console.log(TAG + "[POST] 无效的章节 ID 格式: " + chapterId);
      return res.status(400).json({ code: 400, message: "章节 ID 格式无效，必须为纯数字。", data: null });
    }

    // ========== 2. 权限校验 ==========
    const courseResult = await bookRepo.getCourseById(courseId);
    if (courseResult.code === 404) {
      console.log(TAG + "[POST] 课程不存在，courseId: " + courseId);
      return res.status(404).json({ code: 404, message: "课程不存在。", data: null });
    }
    if (courseResult.code !== 200) {
      console.log(TAG + "[POST] 课程查询失败: " + courseResult.message);
      return res.status(500).json({ code: 500, message: courseResult.message || "课程查询失败。", data: null });
    }

    // 校验所有权
    if (String(courseResult.course.userId) !== String(req.userId)) {
      console.log(TAG + "[POST] 越权访问：课程 userId=" + courseResult.course.userId + "，请求 userId=" + req.userId);
      return res.status(403).json({ code: 403, message: "无权访问该课程。", data: null });
    }

    // ========== 3. 调用补全函数 ==========
    const result = await fixMissingFilesForChapter(courseId, chapterId);

    if (result.code === 409) {
      return res.status(409).json({
        code: 409,
        message: result.message,
        data: { status: result.status, missingFiles: result.missingFiles },
      });
    }

    return res.status(200).json({
      code: 0,
      message: result.message,
      data: { status: result.status, missingFiles: result.missingFiles },
    });

  } catch (error) {
    console.error(TAG + "[POST] 处理异常: " + error.message);
    console.error(error.stack);
    return res.status(500).json({
      code: 500,
      message: "服务器内部错误: " + error.message,
      data: null,
    });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/chapters/{chapterId}/fix-status:
 *   get:
 *     tags: [章节]
 *     summary: 查询文件补全状态
 *     description: 查询指定章节的文件补全任务是否正在进行中，以及当前已发现的缺失文件列表。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 课程 ID（纯数字）
 *       - name: chapterId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 章节 ID（纯数字）
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
 *                     isFixing: { type: boolean, example: true, description: "是否正在补全" }
 *                     missingFiles:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: "当前已知的缺失文件路径列表"
 *       400:
 *         description: ID 格式无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "章节 ID 格式无效" }
 *       401:
 *         description: 未认证
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "Token 无效" }
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string, example: "服务器内部错误" }
 */

/**
 * GET /api/v1/courses/:courseId/chapters/:chapterId/fix-status — 查询补全状态
 */
router.get("/courses/:courseId/chapters/:chapterId/fix-status", authenticateToken, async (req, res) => {
  const { chapterId } = req.params; // 从 URL 路径参数提取章节 ID
  console.log(TAG + "[GET] 查询补全状态，chapterId: " + chapterId);

  try {
    // 参数校验
    const parsedChapterId = parseInt(chapterId, 10);
    if (isNaN(parsedChapterId) || String(parsedChapterId) !== chapterId) {
      return res.status(400).json({ code: 400, message: "章节 ID 格式无效，必须为纯数字。", data: null });
    }

    // 查询内存中的补全状态
    const status = getFixStatus(chapterId);

    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: status,
    });

  } catch (error) {
    console.error(TAG + "[GET] 处理异常: " + error.message);
    return res.status(500).json({
      code: 500,
      message: "服务器内部错误: " + error.message,
      data: null,
    });
  }
});

// ==================== 模块导出 ====================
module.exports = router;
