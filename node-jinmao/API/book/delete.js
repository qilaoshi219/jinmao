// ==================== 教材删除路由模块 ====================
// 职责：提供教材软删除功能（标记 isDeleted=true，不删除 MinIO 文件）
// 端点：DELETE /api/v1/books/:id
// 鉴权：需 Bearer Token（authenticateToken 中间件）

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例

// 导入 JWT 鉴权中间件（路径从 API/book/delete.js 向上两级到项目根目录）
const { authenticateToken } = require("../../middleware/auth");
// 导入 Repository 层：教材数据库操作
const bookRepo = require("../../utils/repo/book_repo");

// 日志前缀
const TAG = "[API_book_delete]";

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/books/{id}:
 *   delete:
 *     tags: [教材]
 *     summary: 删除教材
 *     description: 软删除指定教材（标记 isDeleted=true，不删除 MinIO 文件）。仅允许教材所有者操作。
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
 *         description: 删除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "教材已删除。" }
 *                 data: { type: object, nullable: true, example: null }
 *       400:
 *         description: 参数格式无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "教材 ID 格式无效，必须为纯数字。" }
 *                 data: { type: object, nullable: true, example: null }
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
 *         description: 无权操作（教材不属于当前用户）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 403 }
 *                 message: { type: string, example: "无权操作该教材。" }
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
 * DELETE /api/v1/books/:id — 删除教材（软删除 + 所有者权限校验）
 */
router.delete("/books/:id", authenticateToken, async (req, res) => {
  const bookId = req.params.id;
  console.log(TAG + "[DELETE /books/:id] 收到教材删除请求，bookId: " + bookId + "，userId: " + req.userId);

  try {
    // ========== 1. 参数校验：ID 必须为有效数字字符串 ==========
    // parseInt 将字符串转为整数，再转回字符串比较，确保输入是纯数字
    const parsedId = parseInt(bookId, 10);
    if (isNaN(parsedId) || String(parsedId) !== bookId) {
      console.log(TAG + "[DELETE /books/:id] 无效的教材 ID 格式: " + bookId);
      return res.status(400).json({
        code: 400,
        message: "教材 ID 格式无效，必须为纯数字。",
        data: null,
      });
    }

    // ========== 2. 查询教材是否存在（getCourseById 已过滤 isDeleted=false） ==========
    const result = await bookRepo.getCourseById(bookId);

    // 教材不存在（可能已被删除或从未创建）
    if (result.code === 404) {
      console.log(TAG + "[DELETE /books/:id] 教材不存在，bookId: " + bookId);
      return res.status(404).json({
        code: 404,
        message: "教材不存在。",
        data: null,
      });
    }

    // 其他数据库异常
    if (result.code !== 200) {
      console.log(TAG + "[DELETE /books/:id] 查询教材失败: " + result.message);
      return res.status(500).json({
        code: 500,
        message: result.message || "查询教材信息失败。",
        data: null,
      });
    }

    const course = result.course; // 提取课程对象

    // ========== 3. 权限校验：仅允许教材所有者删除 ==========
    // BigInt 需转为字符串再比较，防止类型不匹配
    if (String(course.userId) !== String(req.userId)) {
      console.log(TAG + "[DELETE /books/:id] 越权删除：课程 userId=" + course.userId +
        "，请求 userId=" + req.userId);
      return res.status(403).json({
        code: 403,
        message: "无权操作该教材。",
        data: null,
      });
    }

    // ========== 4. 执行软删除（标记 isDeleted=true，不删除 MinIO 文件） ==========
    const deleteResult = await bookRepo.softDeleteCourse(bookId);

    // 软删除时教材不存在（极小概率并发场景，getCourseById 查到后又被删）
    if (deleteResult.code === 404) {
      console.log(TAG + "[DELETE /books/:id] 软删除时教材不存在（并发删除）");
      return res.status(404).json({
        code: 404,
        message: "教材不存在。",
        data: null,
      });
    }

    // 软删除数据库异常
    if (deleteResult.code !== 200) {
      console.log(TAG + "[DELETE /books/:id] 软删除失败: " + deleteResult.message);
      return res.status(500).json({
        code: 500,
        message: deleteResult.message || "删除教材失败。",
        data: null,
      });
    }

    // 删除成功
    console.log(TAG + "[DELETE /books/:id] 软删除成功，bookId: " + bookId);
    return res.status(200).json({
      code: 0,
      message: "教材已删除。",
      data: null,
    });

  } catch (error) {
    // 未预料的异常统一捕获
    console.error(TAG + "[DELETE /books/:id] 未捕获异常: " + error.message);
    return res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
      data: null,
    });
  }
});

// 导出路由实例，供 index.js 合并
module.exports = router;
