// ==================== 题库导入路由模块 ====================
// 职责：提供 JSON 格式题库导入功能
// 端点：POST /api/v1/quiz/import-json

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../../middleware/auth");
const { importQuestionBankByJson } = require("../../service/quiz_import");

// 日志前缀
const TAG = "[API_quiz_import]";

/**
 * @openapi
 * /api/v1/quiz/import-json:
 *   post:
 *     tags: [题库]
 *     summary: JSON格式导入题库
 *     description: 提交题库名称、试卷名称和题目 JSON 数组，系统解析后逐题入库
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [textbookName, examName, questions]
 *             properties:
 *               textbookName: { type: string, example: "教师资格证考试题库", description: "题库名称" }
 *               examName: { type: string, example: "综合素质", description: "试卷名称" }
 *               description: { type: string, description: "题库描述（可选）" }
 *               questions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [type, question, answer]
 *                   properties:
 *                     id: { type: string, description: "题目ID（可选）" }
 *                     type: { type: string, enum: [single, multiple, judge, fill, short_answer, essay] }
 *                     question: { type: string, description: "题干" }
 *                     options: { type: array, items: { type: string }, description: "选项数组（选择题必填）" }
 *                     answer: { oneOf: [{ type: string }, { type: array, items: { type: string } }], description: "答案" }
 *                     explanation: { type: string, description: "解析（可选）" }
 *           example:
 *             textbookName: "示例题库"
 *             examName: "第一章"
 *             questions:
 *               - type: "single"
 *                 question: "以下哪个是中国的首都？"
 *                 options: ["A. 上海", "B. 北京", "C. 广州", "D. 深圳"]
 *                 answer: "B"
 *                 explanation: "北京是中华人民共和国的首都。"
 *               - type: "judge"
 *                 question: "地球是太阳系中最大的行星。"
 *                 answer: false
 *     responses:
 *       200:
 *         description: 导入成功
 *       400:
 *         description: 请求参数错误
 *       500:
 *         description: 导入失败
 */
router.post("/import-json", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /import-json] 收到题库导入请求，userId: " + req.userId);

  try {
    const { textbookName, examName, description, questions } = req.body;

    // 校验必填字段
    if (!textbookName || !textbookName.trim()) {
      return res.status(400).json({ code: 400, message: "题库名称（textbookName）不能为空。", data: null });
    }
    if (!examName || !examName.trim()) {
      return res.status(400).json({ code: 400, message: "试卷名称（examName）不能为空。", data: null });
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ code: 400, message: "题目数组（questions）不能为空。", data: null });
    }

    // 执行导入
    const result = await importQuestionBankByJson({
      textbookName: textbookName.trim(),
      examName: examName.trim(),
      description: description || null,
      userId: req.userId,
      questions,
    });

    if (result.success) {
      return res.status(200).json({
        code: 0,
        message: result.message,
        data: result.data,
      });
    } else {
      return res.status(400).json({
        code: 400,
        message: result.message,
        data: result.data,
      });
    }
  } catch (error) {
    console.error(TAG + " [POST /import-json] 异常: " + error.message);
    console.error(error.stack);
    return res.status(500).json({
      code: 500,
      message: "服务器内部错误: " + error.message,
      data: null,
    });
  }
});

module.exports = router;
