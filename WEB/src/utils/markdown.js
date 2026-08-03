// ==================== Markdown 渲染工具 ====================
// 职责：AI 回答内容为 Markdown（加粗/列表/标题/代码块等），
//       统一渲染为安全 HTML（marked 解析 + DOMPurify 消毒）

import { marked } from "marked";
import DOMPurify from "dompurify";

// GFM 语法 + 软换行（\n 转 <br>），贴近聊天场景
marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * 将 Markdown 文本渲染为经过消毒的 HTML
 * @param {string} text - Markdown 文本
 * @returns {string} 安全 HTML
 */
export function renderMarkdown(text) {
  if (!text || typeof text !== "string") return "";
  const html = marked.parse(text);
  return DOMPurify.sanitize(html);
}
