// ==================== PDF→Quiz API 路由 ====================
// 职责：接收 PDF 文件上传 → 转换 MD → 创建 MD→JSON 任务
// 端点前缀：/api/v1/quiz/pdf2quiz

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authenticateToken } = require("../../middleware/auth");
const { convertPdfToMd } = require("../../service/md2quiz/pdf-to-md");
const { createMd2QuizTask } = require("../../service/md2quiz/task-service");

const TAG = "[API_pdf2quiz]";

// ==================== 临时上传目录 ====================
const UPLOAD_DIR = path.resolve(__dirname, "../../data/temp_pdf");

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(TAG + " 创建上传临时目录: " + UPLOAD_DIR);
}

// ==================== multer 配置 ====================
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      // 生成唯一文件名（时间戳 + 随机数 + .pdf 扩展名）
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, "pdf-" + uniqueSuffix + ".pdf");
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (_req, file, cb) => {
    // 仅接受 PDF 文件
    if (file.mimetype === "application/pdf" || path.extname(file.originalname).toLowerCase() === ".pdf") {
      cb(null, true);
      return;
    }
    // 不支持的格式
    const error = new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file");
    error.message = "仅支持上传 PDF 格式的文件。";
    cb(error);
  },
});

// ==================== 错误处理 ====================

/**
 * 处理 multer 错误
 * @param {Error} err
 * @param {import('express').Response} res
 * @returns {boolean} 是否已处理
 */
function handleMulterError(err, res) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ code: 400, message: "文件过大，最大支持 50MB。", data: null });
      return true;
    }
    res.status(400).json({ code: 400, message: err.message || "文件上传错误。", data: null });
    return true;
  }
  return false;
}

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/quiz/pdf2quiz/upload:
 *   post:
 *     tags: [题库]
 *     summary: 上传 PDF 自动生成题库
 *     description: 上传 PDF 文件 → Doc2x 转换为 MD → 创建 MD→JSON 后台任务
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, textbookName, examName]
 *             properties:
 *               file: { type: string, format: binary, description: "PDF 文件" }
 *               textbookName: { type: string, example: "闸门运行工题库" }
 *               examName: { type: string, example: "第一章" }
 *               description: { type: string, description: "题库描述（可选）" }
 *               singleQty: { type: integer, default: 10, description: "单选题数量" }
 *               multipleQty: { type: integer, default: 10, description: "多选题数量" }
 *               judgeQty: { type: integer, default: 5, description: "判断题数量" }
 *               fillQty: { type: integer, default: 5, description: "填空题数量" }
 *               shortAnswerQty: { type: integer, default: 2, description: "简答题数量" }
 *     responses:
 *       202:
 *         description: 转换任务创建成功
 *       400:
 *         description: 参数错误
 *       401:
 *         description: 未登录
 */
router.post("/upload", authenticateToken, (req, res) => {
  // 使用 multer 处理文件上传（单文件，字段名为 "file"）
  upload.single("file")(req, res, async (err) => {
    // ===== multer 错误处理 =====
    if (err) {
      if (handleMulterError(err, res)) return;
      console.error(TAG + " [POST /upload] multer 错误: " + err.message);
      return res.status(500).json({ code: 500, message: "文件上传失败: " + err.message, data: null });
    }

    // ===== 文件检查 =====
    if (!req.file) {
      return res.status(400).json({ code: 400, message: "请选择要上传的文件。", data: null });
    }

    const filePath = req.file.path;

    // ===== 参数校验 =====
    const textbookName = (req.body.textbookName || "").trim();
    const examName = (req.body.examName || "").trim();
    const description = (req.body.description || "").trim();

    if (!textbookName) {
      cleanupFile(filePath);
      return res.status(400).json({ code: 400, message: "textbookName 不能为空。", data: null });
    }
    if (!examName) {
      cleanupFile(filePath);
      return res.status(400).json({ code: 400, message: "examName 不能为空。", data: null });
    }

    // 解析题型配额
    const generationConfig = {
      single: parseIntInput(req.body.singleQty, 10),
      multiple: parseIntInput(req.body.multipleQty, 10),
      judge: parseIntInput(req.body.judgeQty, 5),
      fill: parseIntInput(req.body.fillQty, 5),
      shortAnswer: parseIntInput(req.body.shortAnswerQty, 2),
    };

    // 需要至少 1 种题型有配额
    const totalQty = Object.values(generationConfig).reduce((a, b) => a + b, 0);
    if (totalQty <= 0) {
      cleanupFile(filePath);
      return res.status(400).json({
        code: 400,
        message: "请至少为一种题型设置大于 0 的数量。",
        data: null,
      });
    }

    console.log(TAG + " [POST /upload] 收到 PDF 上传请求", {
      fileName: req.file.originalname,
      fileSize: req.file.size,
      textbookName,
      examName,
      generationConfig,
    });

    try {
      // ===== 创建任务前：余额校验 =====
      const { checkCanUseAI } = require("../../utils/balance");
      const balanceCheck = await checkCanUseAI(req.userId);
      if (!balanceCheck.allowed) {
        console.log(TAG + " [POST /upload] 余额不足，拒绝创建任务: " + balanceCheck.reason);
        cleanupFile(filePath);
        return res.status(402).json({
          code: 402,
          message: balanceCheck.reason,
          data: { balance: balanceCheck.balance, balanceLocked: balanceCheck.balanceLocked },
        });
      }

      // ===== PDF → MD 转换 =====
      console.log(TAG + " 开始 PDF → MD 转换...");
      const { markdownContent, fileName } = await convertPdfToMd(filePath, req.userId);

      console.log(TAG + " PDF 转换完成，创建 MD→JSON 任务...");
      const task = await createMd2QuizTask(
        {
          fileName,
          markdownContent,
          textbookName,
          examName,
          description: description || undefined,
          generationConfig,
        },
        req.userId
      );

      console.log(TAG + " PDF 导入任务创建成功，taskId: " + task.taskId);

      return res.status(202).json({
        code: 0,
        message: "PDF 已上传并开始转换为题库，后台正在生成中...",
        data: {
          taskId: task.taskId,
          textbookId: task.textbookId,
          status: task.status,
          textbookName: task.textbookName,
          examName: task.examName,
          generationConfig: task.generationConfig,
          markdownLength: markdownContent.length,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF 转换失败。";
      console.error(TAG + " [POST /upload] 处理失败: " + message);
      console.error(error.stack);

      return res.status(500).json({
        code: 500,
        message: "PDF 处理失败: " + message,
        data: null,
      });
    }
  });
});

// ==================== 辅助函数 ====================

/**
 * 解析整数输入
 * @param {string|undefined} value
 * @param {number} defaultValue
 * @returns {number}
 */
function parseIntInput(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : defaultValue;
}

/**
 * 清理上传的临时文件
 * @param {string} filePath
 */
function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {
    // 静默处理
  }
}

module.exports = router;
