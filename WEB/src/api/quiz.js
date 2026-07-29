// ==================== 题库 API 封装 ====================
// 职责：封装所有刷题相关的前端 API 调用
// 使用项目统一的 apiClient（自动注入 JWT Token）

import apiClient from "./client";

// ==================== 题库管理 ====================

/**
 * 获取题库列表
 * @param {Object} params - { page, pageSize, keyword }
 */
export function listQuizTextbooks(params = {}) {
  console.log("[quiz_api] 请求题库列表，params:", params);
  return apiClient
    .get("/quiz/textbooks", { params })
    .then((res) => res.data);
}

/**
 * 获取题库详情
 * @param {string} id - 题库 ID
 */
export function getQuizTextbookDetail(id) {
  return apiClient
    .get("/quiz/textbooks/" + id)
    .then((res) => res.data);
}

/**
 * 删除题库
 * @param {string} id - 题库 ID
 */
export function deleteQuizTextbook(id) {
  return apiClient
    .delete("/quiz/textbooks/" + id)
    .then((res) => res.data);
}

// ==================== 题库导入 ====================

/**
 * JSON 格式导入题库
 * @param {Object} payload - { textbookName, examName, description?, questions[] }
 */
export function importQuiz(payload) {
  console.log("[quiz_api] 导入题库，题库名:", payload.textbookName);
  return apiClient
    .post("/quiz/import-json", payload)
    .then((res) => res.data);
}

// ==================== 刷题会话 ====================

/**
 * 批量查询教材的随机刷题会话状态
 * @param {string[]} textbookIds - 题库 ID 数组
 */
export function getRandomSessionStatus(textbookIds) {
  const ids = Array.isArray(textbookIds) ? textbookIds.join(",") : textbookIds;
  return apiClient
    .get("/quiz/random-status", { params: { textbookIds: ids } })
    .then((res) => res.data);
}

/**
 * 开始或继续随机刷题
 * @param {string} textbookId - 题库 ID
 */
export function startRandomSession(textbookId) {
  console.log("[quiz_api] 开始/继续随机刷题，textbookId:", textbookId);
  return apiClient
    .post("/quiz/random-sessions", { textbookId })
    .then((res) => res.data);
}

/**
 * 获取会话详情
 * @param {string} sessionId - 会话 ID
 */
export function getRandomSessionDetail(sessionId) {
  return apiClient
    .get("/quiz/random-sessions/" + sessionId)
    .then((res) => res.data);
}

/**
 * 保存刷题进度
 * @param {string} sessionId - 会话 ID
 * @param {Object} payload - { currentQuestionIndex, questionId?, answer? }
 */
export function saveRandomSessionProgress(sessionId, payload) {
  return apiClient
    .put("/quiz/random-sessions/" + sessionId + "/progress", payload)
    .then((res) => res.data);
}

/**
 * 交卷
 * @param {string} sessionId - 会话 ID
 */
export function completeRandomSession(sessionId) {
  console.log("[quiz_api] 交卷，sessionId:", sessionId);
  return apiClient
    .post("/quiz/random-sessions/" + sessionId + "/complete")
    .then((res) => res.data);
}

// ==================== 刷题报告 ====================

/**
 * 报告列表
 * @param {Object} params - { limit, offset }
 */
export function listQuizReports(params = {}) {
  return apiClient
    .get("/quiz/reports", { params })
    .then((res) => res.data);
}

/**
 * 最近报告列表
 * @param {number} limit
 */
export function getRecentQuizReports(limit = 5) {
  return apiClient
    .get("/quiz/reports/recent", { params: { limit } })
    .then((res) => res.data);
}

/**
 * 获取报告详情
 * @param {string} reportId
 */
export function getQuizReportDetail(reportId) {
  return apiClient
    .get("/quiz/reports/" + reportId)
    .then((res) => res.data);
}

/**
 * SSE 实时订阅报告判题进度
 * 返回原始 Response 对象，由调用方使用 reader 读取
 * @param {string} reportId
 */
export function streamQuizReport(reportId) {
  const token = localStorage.getItem("jinmao_token");
  return fetch("/api/v1/quiz/reports/" + reportId + "/stream", {
    headers: {
      Authorization: "Bearer " + token,
    },
  });
}

// ==================== 错题本 ====================

/**
 * 错题概览
 */
export function getWrongbookOverview() {
  return apiClient
    .get("/quiz/wrongbook/overview")
    .then((res) => res.data);
}

/**
 * 批量查询错题复习会话状态
 * @param {string[]} textbookIds
 */
export function getWrongbookReviewStatus(textbookIds) {
  const ids = Array.isArray(textbookIds) ? textbookIds.join(",") : textbookIds;
  return apiClient
    .get("/quiz/wrongbook/review-status", { params: { textbookIds: ids } })
    .then((res) => res.data);
}

/**
 * 开始或继续错题复习
 * @param {string} textbookId
 */
export function startWrongbookReviewSession(textbookId) {
  return apiClient
    .post("/quiz/wrongbook/review-sessions", { textbookId })
    .then((res) => res.data);
}

/**
 * 获取错题复习会话详情
 * @param {string} sessionId
 */
export function getWrongbookReviewSessionDetail(sessionId) {
  return apiClient
    .get("/quiz/wrongbook/review-sessions/" + sessionId)
    .then((res) => res.data);
}

/**
 * 提交错题作答
 * @param {string} sessionId
 * @param {Object} payload - { questionId, answer }
 */
export function submitWrongbookAnswer(sessionId, payload) {
  return apiClient
    .post("/quiz/wrongbook/review-sessions/" + sessionId + "/submit", payload)
    .then((res) => res.data);
}
