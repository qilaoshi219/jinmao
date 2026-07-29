// ==================== Markdown 切块器 ====================
// 职责：按"字符阈值定位行号 + 按整行发送"规则切分超长 Markdown 文本
// 移植自 test/金毛刷题/backend/src/modules/markdown-json-test/chunker.ts

const TAG = "[md2quiz_chunker]";

/** 每块字符阈值 */
const BLOCK_THRESHOLD = 3000;
/** 剩余文本低于此阈值时不继续切分，直接作为最后一块 */
const FINAL_REMAINDER_THRESHOLD = 4000;

/**
 * 按整行规则切分 Markdown 文本为多个块
 * 每个块长度约 BLOCK_THRESHOLD 字符，保证在整行边界处切分
 *
 * @param {string} markdownContent - 原始 Markdown 文本
 * @returns {import("./types").ChunkRecord[]} 分块数组
 */
function chunkMarkdownByLineThreshold(markdownContent) {
  // 统一换行符
  const normalizedContent = markdownContent.replace(/\r\n/g, "\n");
  const lines = normalizedContent.split("\n");

  // 空文本返回空数组
  if (normalizedContent.trim().length === 0) {
    return [];
  }

  console.log(TAG + " 开始按整行规则切分 Markdown", {
    totalLength: normalizedContent.length,
    totalLineCount: lines.length,
  });

  // 构建每行结束位置的累计字符索引
  const cumulativeLineEndChars = [];
  let cumulativeLength = 0;

  lines.forEach((line, index) => {
    cumulativeLength += line.length;
    // 非最后一行需要加上换行符长度
    if (index < lines.length - 1) {
      cumulativeLength += 1;
    }
    cumulativeLineEndChars.push(cumulativeLength);
  });

  /** @type {import("./types").ChunkRecord[]} */
  const chunks = [];
  let currentStartLineIndex = 0;
  let currentThreshold = BLOCK_THRESHOLD;

  while (currentStartLineIndex < lines.length) {
    const currentStartChar =
      currentStartLineIndex === 0
        ? 0
        : cumulativeLineEndChars[currentStartLineIndex - 1];
    const remainingLength = normalizedContent.length - currentStartChar;

    // 剩余长度不足阈值时，直接纳入最后一块
    if (remainingLength <= FINAL_REMAINDER_THRESHOLD) {
      const finalChunkContent = lines.slice(currentStartLineIndex).join("\n");

      chunks.push({
        index: chunks.length + 1,
        startLine: currentStartLineIndex + 1,
        endLine: lines.length,
        startChar: currentStartChar + 1,
        endChar: normalizedContent.length,
        content: finalChunkContent,
      });

      break;
    }

    // 找到第一个超过阈值的行结束位置
    let endLineIndex = cumulativeLineEndChars.findIndex(
      (lineEndChar) =>
        lineEndChar >= currentThreshold && lineEndChar > currentStartChar
    );

    if (endLineIndex === -1 || endLineIndex < currentStartLineIndex) {
      endLineIndex = lines.length - 1;
    }

    const currentChunkContent = lines
      .slice(currentStartLineIndex, endLineIndex + 1)
      .join("\n");

    chunks.push({
      index: chunks.length + 1,
      startLine: currentStartLineIndex + 1,
      endLine: endLineIndex + 1,
      startChar: currentStartChar + 1,
      endChar: cumulativeLineEndChars[endLineIndex],
      content: currentChunkContent,
    });

    // 移动到下一块的起始位置
    currentStartLineIndex = endLineIndex + 1;
    currentThreshold += BLOCK_THRESHOLD;
  }

  console.log(TAG + " Markdown 切分完成", {
    chunkCount: chunks.length,
    previewRanges: chunks
      .slice(0, 5)
      .map((chunk) => `${chunk.startLine}-${chunk.endLine}`),
  });

  return chunks;
}

module.exports = { chunkMarkdownByLineThreshold };
