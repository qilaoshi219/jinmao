// 本模块接受markdown文件内容（字符串），给每一行添加行号索引后，返回带索引的文本内容。
// 返回值格式：{ code: number, text: string, message?: string }
//   code 200 — 成功添加行号索引，text 为带行号的文本内容
//   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限等）

const { validateString } = require("./input_validator");

// validateInput 已迁移至公共验证模块 input_validator.js，通过 validateString 统一调用

/**
 * 给 Markdown 文本的每一行添加行号索引
 * 
 * 返回值格式：{ code: number, text: string, message?: string }
 * 
 * 状态码说明（参考 HTTP 状态码语义）：
 *   code 200 — 成功添加行号索引，text 为带行号的格式化文本
 *   code 400 — 输入参数不合法（空值/类型错误/注入攻击/长度超限等）
 * 
 * @param {string} markdownContent - 待处理的 Markdown 文本内容
 * @returns {{ code: number, text: string, message?: string }}
 *   始终返回对象，不会抛出异常。调用方根据 code 判断结果：
 *   - code 200 时 text 为带行号索引的文本内容，可直接使用
 *   - code ≥ 400 时 text 为空字符串，通过 message 了解失败原因
 */
function addLineNumbers(markdownContent) {
  // ========== 前置输入验证：使用公共验证模块拦截非法输入 ==========
  const validationResult = validateString(markdownContent, "Markdown 文本内容", {
    maxLength: 100000,
    required: true,
    moduleTag: "[line_indexer]"
  });
  if (!validationResult.valid) {
    console.error("[addLineNumbers] 输入验证未通过（code=" + validationResult.errorCode + "），拒绝执行：" + validationResult.error);
    return {
      code: validationResult.errorCode,
      text: "",
      message: validationResult.error
    };
  }
  console.log("[addLineNumbers] 输入验证通过，开始执行行号索引添加流程。");

  // ==================== 核心处理逻辑：按行分割并添加行号 ====================

  // 按换行符分割文本为行数组
  const lines = markdownContent.split("\n");
  const totalLines = lines.length;

  console.log("[addLineNumbers] 文本共 " + totalLines + " 行，开始添加行号索引。");

  // 计算行号需要的宽度（用于对齐，确保所有行号占用相同宽度）
  // 例如 99 行时宽度为 2，100 行时宽度为 3
  const lineNumberWidth = String(totalLines).length;

  // 逐行添加行号索引，格式为：右侧对齐行号 | 原始内容
  const indexedLines = [];
  for (let i = 0; i < totalLines; i++) {
    // 行号从 1 开始，右侧对齐
    const lineNumber = String(i + 1).padStart(lineNumberWidth, " ");
    // 拼接格式：行号 + 分隔符 + 原始行内容
    indexedLines.push(lineNumber + " | " + lines[i]);
  }

  // 将处理后的行重新组合为字符串（保留原始换行符模式）
  const result = indexedLines.join("\n");

  console.log("[addLineNumbers] 行号索引添加完成：共处理 " + totalLines + " 行，输出 " + result.length + " 字符。");

  // ==================== 成功：返回带行号索引的文本 ====================
  return {
    code: 200,
    text: result
  };
}

// 导出 addLineNumbers 和 validateInput，供其他模块通过 require 调用
module.exports = { addLineNumbers };
