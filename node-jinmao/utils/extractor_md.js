//本模块接受一个md文件、开始行数和结束行数，返回该行范围内的文本内容
// 返回值格式：{ code: number, text: string, message?: string }
//   code 200 — 成功提取
//   code 206 — 成功提取，但结束行超出总行数，已自动截断（text 仍为截断后的内容）
//   code 400 — 参数不合法（路径为空/类型错误/行号非法/startLine>endLine/路径是目录/文件为空）
//   code 404 — 文件不存在
//   code 416 — 起始行号超出文件总行数（无内容返回）

const fs = require("fs");
const path = require("path");

/**
 * 参数校验函数 —— 对输入参数及文件内容进行严格的合法性检查
 * 检查内容：
 *   1. 文件路径是否为空、是否为字符串类型
 *   2. 起始行号 / 结束行号是否为 number 类型、是否为正整数
 *   3. 起始行号是否 ≤ 结束行号
 *   4. 文件是否存在、路径是否指向文件（而非目录）
 *   5. 文件是否有内容（不为空）
 *   6. 起始行号是否超出文件总行数
 *   7. 结束行号超出文件总行数时自动截断（不抛错，返回截断后的行号）
 * @param {string} mdFilePath - Markdown 文件的路径
 * @param {number} startLine  - 起始行号（从 1 开始）
 * @param {number} endLine    - 结束行号
 * @returns {{ valid: boolean, errorCode?: number, error?: string, totalLines?: number, actualEndLine?: number, truncated?: boolean }}
 *   valid=false 时附带 errorCode（与 extractLines 返回码一致）和 error 说明
 *   valid=true  时附带 totalLines、actualEndLine、truncated（是否被截断）
 */
function validateParams(mdFilePath, startLine, endLine) {
  // ==================== 1. mdFilePath 参数校验 ====================
  // 检查是否为空值
  if (mdFilePath === null || mdFilePath === undefined || mdFilePath === "") {
    let errMsg = "[validateParams] 错误：文件路径(mdFilePath)不能为空。";
    console.error(errMsg);
    return { valid: false, errorCode: 400, error: errMsg };
  }
  // 检查是否为字符串类型
  if (typeof mdFilePath !== "string") {
    let errMsg = "[validateParams] 错误：文件路径(mdFilePath)必须为字符串类型，实际类型为 " + typeof mdFilePath + "。";
    console.error(errMsg);
    return { valid: false, errorCode: 400, error: errMsg };
  }

  // ==================== 2. startLine 参数校验 ====================
  // 检查是否为 number 类型
  if (typeof startLine !== "number") {
    let errMsg = "[validateParams] 错误：起始行号(startLine)必须为 number 类型，实际类型为 " + typeof startLine + "。";
    console.error(errMsg);
    return { valid: false, errorCode: 400, error: errMsg };
  }
  // 检查是否为正整数（大于 0）
  if (!Number.isInteger(startLine) || startLine <= 0) {
    let errMsg = "[validateParams] 错误：起始行号(startLine)必须为正整数（> 0），实际值为 " + startLine + "。";
    console.error(errMsg);
    return { valid: false, errorCode: 400, error: errMsg };
  }

  // ==================== 3. endLine 参数校验 ====================
  // 检查是否为 number 类型
  if (typeof endLine !== "number") {
    let errMsg = "[validateParams] 错误：结束行号(endLine)必须为 number 类型，实际类型为 " + typeof endLine + "。";
    console.error(errMsg);
    return { valid: false, errorCode: 400, error: errMsg };
  }
  // 检查是否为正整数（大于 0）
  if (!Number.isInteger(endLine) || endLine <= 0) {
    let errMsg = "[validateParams] 错误：结束行号(endLine)必须为正整数（> 0），实际值为 " + endLine + "。";
    console.error(errMsg);
    return { valid: false, errorCode: 400, error: errMsg };
  }

  // ==================== 4. 行号范围校验 ====================
  // 起始行号不能大于结束行号
  if (startLine > endLine) {
    let errMsg = "[validateParams] 错误：起始行号(" + startLine + ")不能大于结束行号(" + endLine + ")。";
    console.error(errMsg);
    return { valid: false, errorCode: 400, error: errMsg };
  }

  // ==================== 5. 文件存在性校验 ====================
  // 将路径解析为绝对路径，确保路径格式正确
  const absolutePath = path.resolve(mdFilePath);
  // 检查文件是否存在
  if (!fs.existsSync(absolutePath)) {
    let errMsg = "[validateParams] 错误：文件不存在 —— " + absolutePath;
    console.error(errMsg);
    return { valid: false, errorCode: 404, error: errMsg };
  }
  // 检查是否为文件（而非目录）
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    let errMsg = "[validateParams] 错误：路径指向的不是文件 —— " + absolutePath;
    console.error(errMsg);
    return { valid: false, errorCode: 400, error: errMsg };
  }

  // ==================== 6. 文件内容相关的行号校验 ====================
  // 读取文件内容，获取总行数
  const fileContent = fs.readFileSync(absolutePath, "utf8");
  const lines = fileContent.split("\n");
  const totalLines = lines.length;

  // 6.1 检查文件是否为空
  if (totalLines === 0) {
    let errMsg = "[validateParams] 错误：文件内容为空 —— " + absolutePath;
    console.error(errMsg);
    return { valid: false, errorCode: 400, error: errMsg };
  }

  // 6.2 检查起始行号是否超出文件总行数
  if (startLine > totalLines) {
    let errMsg = "[validateParams] 错误：起始行号(" + startLine + ")超出文件总行数(" + totalLines + ")。";
    console.error(errMsg);
    return { valid: false, errorCode: 416, error: errMsg };
  }

  // 6.3 处理结束行号超出文件总行数的情况 —— 自动截断
  let actualEndLine = endLine;
  let truncated = false;
  if (endLine > totalLines) {
    actualEndLine = totalLines;
    truncated = true;
    console.warn("[validateParams] 警告：结束行号(" + endLine + ")超出文件总行数(" + totalLines + ")，已自动截断至第 " + totalLines + " 行。");
  }

  // ==================== 全部校验通过 ====================
  console.log("[validateParams] 参数校验通过。文件=" + absolutePath + "，总行数=" + totalLines + "，提取范围=[" + startLine + ", " + actualEndLine + "]，截断=" + truncated + "。");
  return { valid: true, totalLines: totalLines, actualEndLine: actualEndLine, truncated: truncated };
}

/**
 * 从指定的 Markdown 文件中按行号范围提取文本内容
 * 
 * 返回值格式：{ code: number, text: string, message?: string }
 * 
 * 状态码说明（参考 HTTP 状态码语义）：
 *   code 200 — 成功提取全部目标行，无截断
 *   code 206 — 成功提取，但结束行超出总行数已自动截断，text 为截断后的内容，message 含警告说明
 *   code 400 — 请求参数不合法（路径为空/类型错误/行号非法/startLine>endLine/路径是目录/文件为空）
 *   code 404 — 指定的文件不存在
 *   code 416 — 起始行号超出文件总行数，无法提取任何内容
 * 
 * @param {string} mdFilePath - Markdown 文件的路径（支持相对路径和绝对路径）
 * @param {number} startLine  - 起始行号（包含，从 1 开始计数）
 * @param {number} endLine    - 结束行号（包含）
 * @returns {{ code: number, text: string, message?: string }}
 *   始终返回对象，不会抛出异常。调用方根据 code 判断结果：
 *   - code 200/206 时 text 有内容，可直接使用
 *   - code ≥ 400 时 text 为空字符串，通过 message 了解失败原因
 */
function extractLines(mdFilePath, startLine, endLine) {
  // ========== 前置参数校验 ==========
  const validationResult = validateParams(mdFilePath, startLine, endLine);
  if (!validationResult.valid) {
    // 校验不通过，返回错误信息（不再抛出异常）
    console.error("[extractLines] 参数校验未通过（code=" + validationResult.errorCode + "），拒绝执行：" + validationResult.error);
    return {
      code: validationResult.errorCode,
      text: "",
      message: validationResult.error
    };
  }
  console.log("[extractLines] 参数校验通过，开始执行文本提取流程。");

  // ==================== 核心提取逻辑 ====================

  // 将用户输入路径解析为绝对路径
  const absolutePath = path.resolve(mdFilePath);

  // 使用校验阶段已确认有效的 actualEndLine
  const actualEndLine = validationResult.actualEndLine;

  // 输出开始提取的信息
  console.log("[extractLines] 开始提取：文件=" + absolutePath + "，起始行=" + startLine + "，结束行=" + actualEndLine);

  // 同步读取文件全部内容（UTF-8 编码）
  const fileContent = fs.readFileSync(absolutePath, "utf8");

  // 按换行符分割为行数组
  const lines = fileContent.split("\n");

  // 使用 slice 提取目标行（注意：数组索引从 0 开始，行号从 1 开始）
  const extractedLines = lines.slice(startLine - 1, actualEndLine);

  // 将提取的行重新组合为字符串（保留原始换行符）
  const result = extractedLines.join("\n");

  // 输出提取完成的信息
  console.log("[extractLines] 提取完成：共 " + extractedLines.length + " 行，" + result.length + " 字符。");

  // ==================== 构造返回值 ====================
  if (validationResult.truncated) {
    // 206: 内容被截断，但仍返回可用内容 + 警告说明
    return {
      code: 206,
      text: result,
      message: "结束行号超出文件总行数，已自动截断至第 " + validationResult.totalLines + " 行，实际提取范围：[" + startLine + ", " + actualEndLine + "]。"
    };
  }

  // 200: 完整提取成功
  return {
    code: 200,
    text: result
  };
}

// 导出 extractLines 和 validateParams，供其他模块通过 require 调用
module.exports = { extractLines, validateParams };
