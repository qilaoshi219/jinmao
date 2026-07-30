// ==================== 分块内容处理器 ====================
// 职责：接收已切分好的文本块 → AI 格式化每块的内容 → 分类收集题目/答案/完整题
// 关注题型识别、答案提取、异常报告
// 不在本模块关心"从哪里切"（那是 quiz-splitter.js 的职责）
//
// 上次修改：2026-07-30
// 文件说明：题库导入的内容处理器，对已切分好的块进行内容识别和格式化

const path = require("path");
const fs = require("fs");
const { requestDeepseekJsonCompletionStream } = require("./deepseek-client");

// 日志前缀，用于控制台输出标识
const TAG = "[md2quiz_processor]";

/** 缓存已加载的格式化 prompt 模板 */
let cachedFormatPrompt = null;

/**
 * 加载格式化 prompt 模板（带缓存，避免每次处理块都重复读取文件）
 * @returns {Promise<string>} prompt 模板内容
 */
async function loadFormatPrompt() {
  if (cachedFormatPrompt) return cachedFormatPrompt;
  const promptPath = path.resolve(__dirname, "../../config/quiz-format-prompt.md");
  cachedFormatPrompt = await fs.promises.readFile(promptPath, "utf-8");
  console.log(TAG + " 格式化 prompt 模板已加载，共 " + cachedFormatPrompt.length + " 字符");
  return cachedFormatPrompt;
}

/**
 * 处理所有已切分的块，逐块调用 AI 进行内容格式化
 * 
 * 核心逻辑：
 *   对每个已切分好的文本块 → 调用 DeepSeek AI 格式化 → 根据返回的 type 分类收集：
 *     - "questions": 只有题目（答案留空）→ 收集到 questionMap
 *     - "answers": 只有答案 → 收集到 answerMap
 *     - "complete": 题目+答案都有 → 收集到 completeQuestions
 *     - "none": 无题目无答案 → 跳过
 *
 * @param {Array<{startLine: number, endLine: number, text: string}>} chunks - 分段器产出的块列表
 * @returns {Promise<{
 *   questionMap: Map<number, Object>,
 *   answerMap: Map<string, string>,
 *   completeQuestions: Object[],
 *   allWarnings: string[]
 * }>} 分类收集的结果
 */
async function processAllChunks(chunks) {
  const promptTemplate = await loadFormatPrompt();

  // 题号 → 题目对象（无答案，待后续匹配填入）
  /** @type {Map<number, Object>} */
  const questionMap = new Map();
  // 题号字符串 → 答案原文
  /** @type {Map<string, string>} */
  const answerMap = new Map();
  // 完整题目列表（已有答案，无需再匹配）
  /** @type {Object[]} */
  const completeQuestions = [];
  // 所有块的警告信息
  /** @type {string[]} */
  const allWarnings = [];

  console.log(TAG + " ========== 开始处理 " + chunks.length + " 个块 ==========");

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const blockLabel = "块" + (i + 1) + "/" + chunks.length;
    console.log(TAG + " 正在处理 " + blockLabel + " [" + chunk.startLine + "-" + chunk.endLine + "]，" + chunk.text.length + " 字符");

    // ---- 调用 DeepSeek AI 格式化当前块的内容 ----
    let parsed;
    try {
      const result = await requestDeepseekJsonCompletionStream([
        { role: "system", content: "你是题库格式化引擎，严格按 prompt 要求输出 JSON。" },
        { role: "user", content: promptTemplate + "\n\n---\n【文本块 " + (i + 1) + "，原始行号 " + chunk.startLine + "-" + chunk.endLine + "】\n" + chunk.text },
      ]);
      // 清洗可能的 markdown 代码块包裹（```json ... ```）
      let clean = result.content.trim();
      const codeMatch = clean.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (codeMatch) clean = codeMatch[1].trim();
      parsed = JSON.parse(clean);
    } catch (err) {
      console.error(TAG + " " + blockLabel + " AI 处理失败: " + err.message);
      allWarnings.push(blockLabel + " [" + chunk.startLine + "-" + chunk.endLine + "] 处理失败: " + err.message);
      continue; // 跳过当前块，继续处理下一块
    }

    // ---- 收集 AI 自报的 warnings ----
    if (Array.isArray(parsed.warnings) && parsed.warnings.length > 0) {
      allWarnings.push(...parsed.warnings.map(w => blockLabel + ": " + w));
    }

    // ---- 根据 AI 返回的 type 分类收集 ----
    switch (parsed.type) {
      case "questions": {
        // 只有题目（无答案）→ 收集到 questionMap，等待后续答案匹配
        const qs = parsed.questions || [];
        for (const q of qs) {
          if (q.id != null) questionMap.set(q.id, q);
        }
        console.log(TAG + "  " + blockLabel + ": questions 类型，共 " + qs.length + " 题（待匹配答案）");
        break;
      }

      case "answers": {
        // 只有答案（无题目）→ 收集到 answerMap，等待后续按题号匹配
        const answers = parsed.answers || {};
        for (const [id, answer] of Object.entries(answers)) {
          answerMap.set(id, answer);
        }
        console.log(TAG + "  " + blockLabel + ": answers 类型，共 " + Object.keys(answers).length + " 条答案");
        break;
      }

      case "complete": {
        // 题目+答案都有 → 直接收集到完整题目列表
        const qs = parsed.questions || [];
        completeQuestions.push(...qs);
        console.log(TAG + "  " + blockLabel + ": complete 类型，共 " + qs.length + " 题（含答案）");
        break;
      }

      case "none": {
        // 无题目无答案（如前言、目录等）→ 跳过
        console.log(TAG + "  " + blockLabel + ": none 类型，跳过");
        break;
      }

      default: {
        console.warn(TAG + "  " + blockLabel + ": 未知输出类型 type=" + parsed.type + "，跳过");
        break;
      }
    }
  }

  // ---- 处理完成，输出汇总日志 ----
  console.log(TAG + " ========== 全部块处理完成 ==========");
  console.log(TAG + " 统计: 待匹配题目 " + questionMap.size + " 题 | 答案条目 " + answerMap.size + " 条 | 完整题目 " + completeQuestions.length + " 题");
  console.log(TAG + " 警告信息共 " + allWarnings.length + " 条");

  return { questionMap, answerMap, completeQuestions, allWarnings };
}

module.exports = { processAllChunks };
