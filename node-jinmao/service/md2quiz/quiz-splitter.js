// ==================== AI 无损分段器 ====================
// 职责：循环提取 1000 行 → AI 返回 maxLine → 从 maxLine+1 继续
// 只管分界点，不关心题目内容、题型、答案
// 类比课程管线的 get_line.js
//
// 上次修改：2026-07-30
// 文件说明：题库导入的分段器模块，使用 AI 判断语义完整边界防止截断题目

const path = require("path");
const fs = require("fs");
const { requestDeepseekJsonCompletionStream } = require("./deepseek-client");

// 日志前缀，用于控制台输出标识
const TAG = "[md2quiz_splitter]";
// 每次提取的最大行数（对齐课程管线）
const CHUNK_LINES = 1000;

/**
 * 为文本添加行号前缀（对齐课程管线的 addLineNumbers 格式）
 * 格式示例: "    1 | 这是第一行内容"
 * @param {string} text - 原始文本
 * @param {number} [startLineNum=1] - 起始行号
 * @returns {string} 带行号前缀的文本
 */
function addLineNumbers(text, startLineNum = 1) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return lines
    .map((line, idx) => `${String(startLineNum + idx).padStart(5)} | ${line}`)
    .join("\n");
}

/**
 * 校验并清洗 AI 返回的 maxLine，防止死循环
 * 确保 maxLine 在有效范围内且大于起始行号
 * @param {number|string} maxLine - AI 返回的原始 maxLine
 * @param {number} currentStartLine - 当前块的起始行号
 * @param {number} endLine - 当前提取的结束行号
 * @returns {number} 安全的 maxLine
 */
function sanitizeMaxLine(maxLine, currentStartLine, endLine) {
  // maxLine 必须在 [currentStartLine, endLine] 范围内
  const safeMax = Math.max(
    Math.min(Number(maxLine) || endLine, endLine),
    currentStartLine
  );
  // 如果 AI 返回的 maxLine 等于起始行（异常情况），至少前进 100 行防止卡死
  if (safeMax <= currentStartLine) {
    console.warn(TAG + " maxLine(" + maxLine + ") <= startLine(" + currentStartLine + ")，强制前进 100 行");
    return Math.min(currentStartLine + 100, endLine);
  }
  return safeMax;
}

/**
 * AI 无损分段主函数
 * 循环：提取 1000 行 → AI 判断完整边界 → 推进 → 直到文件末尾
 * 
 * 核心逻辑：
 *   1. 从 currentStartLine 开始提取 1000 行文本
 *   2. 添加行号前缀后发送给 DeepSeek AI
 *   3. AI 返回 maxLine（该块内最后一个完整题目的结束行号）
 *   4. 记录该块 → 从 maxLine+1 继续下一轮
 *   5. 如果 maxLine 异常则使用降级策略（固定前进）
 *
 * @param {string} markdownContent - 完整 Markdown 题库文本
 * @returns {Promise<Array<{startLine: number, endLine: number, text: string}>>} 切分好的块列表
 */
async function splitQuizIntoChunks(markdownContent) {
  // 统一换行符并按行拆分
  const lines = markdownContent.replace(/\r\n/g, "\n").split("\n");
  const totalLines = lines.length;

  // 读取 AI 分段 prompt 模板文件
  const promptPath = path.resolve(__dirname, "../../config/quiz-split-prompt.md");
  const promptTemplate = await fs.promises.readFile(promptPath, "utf-8");

  /** @type {Array<{startLine: number, endLine: number, text: string}>} */
  const chunks = [];
  let currentStartLine = 1; // 当前提取的起始行号（1-based）
  let splitIndex = 0;        // 分段序号

  console.log(TAG + " ========== AI 分段开始，总共 " + totalLines + " 行 ==========");

  // 主循环：逐轮提取文本 → AI 判断边界 → 推进
  while (currentStartLine <= totalLines) {
    splitIndex++;

    // ---- 步骤 1：提取 1000 行文本 ----
    const extractEnd = Math.min(currentStartLine + CHUNK_LINES - 1, totalLines);
    const chunkText = lines.slice(currentStartLine - 1, extractEnd).join("\n");

    console.log(TAG + " 分段 #" + splitIndex + ": 提取行 [" + currentStartLine + "-" + extractEnd + "]，" + chunkText.length + " 字符");

    // ---- 步骤 2：添加行号前缀（让 AI 能看到每行的行号） ----
    const indexedText = addLineNumbers(chunkText, currentStartLine);

    // ---- 步骤 3：调用 DeepSeek AI 判断本次的分界点 ----
    let maxLine;
    try {
      const result = await requestDeepseekJsonCompletionStream([
        { role: "system", content: "你是文本分段助手，只返回 maxLine。" },
        { 
          role: "user", 
          content: promptTemplate + "\n\n---\n【待分段文本，行号 " + currentStartLine + "-" + extractEnd + "】\n" + indexedText 
        },
      ]);
      // 清洗可能的 markdown 代码块包裹
      let clean = result.content.trim();
      const codeMatch = clean.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (codeMatch) clean = codeMatch[1].trim();
      const parsed = JSON.parse(clean);
      maxLine = parsed.maxLine;
    } catch (err) {
      // 降级策略：AI 调用失败时使用固定边界（当前提取范围末尾）
      console.error(TAG + " 分段 #" + splitIndex + " AI 调用失败: " + err.message + "，降级使用固定边界");
      maxLine = extractEnd;
    }

    // ---- 步骤 4：校验 maxLine 并记录块 ----
    const safeMaxLine = sanitizeMaxLine(maxLine, currentStartLine, extractEnd);
    chunks.push({
      startLine: currentStartLine,
      endLine: safeMaxLine,
      text: lines.slice(currentStartLine - 1, safeMaxLine).join("\n"),
    });
    console.log(TAG + " 分段 #" + splitIndex + " 完成: maxLine=" + safeMaxLine + "（AI 原始返回值: " + maxLine + "）");

    // ---- 步骤 5：推进到下一块的起始位置（从 maxLine+1 继续） ----
    currentStartLine = safeMaxLine + 1;
  }

  console.log(TAG + " ========== AI 分段完成，共切分为 " + chunks.length + " 个块 ==========");
  return chunks;
}

module.exports = { splitQuizIntoChunks };
