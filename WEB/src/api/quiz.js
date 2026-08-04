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

// ==================== MD→JSON 任务 ====================

/**
 * 创建 MD→JSON 生成任务
 * @param {Object} payload - { fileName, markdownContent, textbookName, examName, description?, generationConfig }
 */
export function createMd2QuizTask(payload) {
  console.log("[quiz_api] 创建 MD→JSON 任务，题库名:", payload.textbookName);
  return apiClient
    .post("/quiz/md2json/tasks", payload)
    .then((res) => res.data);
}

/**
 * 查询 MD→JSON 任务进度（前端轮询用）
 * @param {string} taskId
 */
export function getMd2QuizTaskProgress(taskId) {
  return apiClient
    .get("/quiz/md2json/tasks/" + taskId + "/progress")
    .then((res) => res.data);
}

// ==================== PDF→Quiz 上传 ====================

/**
 * 上传 PDF 文件并自动创建题库生成任务
 * @param {FormData} formData - 包含 file, textbookName, examName 等字段
 */
export function uploadPdfForQuiz(formData) {
  console.log("[quiz_api] 上传 PDF 生成题库");
  return apiClient
    .post("/quiz/pdf2quiz/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 600000, // 10 分钟超时（Doc2x 转换需要时间）
    })
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

// ==================== 题库市场 ====================

/**
 * 获取题库市场列表
 * @param {Object} params - { page, pageSize, keyword }
 * @returns {Promise<{code: number, data: {items, total, page, pageSize}}>}
 */
export function listMarketTextbooks(params = {}) {
  console.log("[quiz_api] 请求题库市场列表，params:", params);
  return apiClient
    .get("/quiz/market", { params })
    .then((res) => res.data);
}

/**
 * 获取市场题库详情
 * @param {string} id - 题库 ID
 */
export function getMarketTextbookDetail(id) {
  return apiClient
    .get("/quiz/market/" + id)
    .then((res) => res.data);
}

/**
 * 借用题库
 * @param {string} id - 题库 ID
 * @returns {Promise<{code: number, message: string}>}
 */
export function borrowTextbook(id) {
  console.log("[quiz_api] 借用题库，id:", id);
  return apiClient
    .post("/quiz/market/" + id + "/borrow")
    .then((res) => res.data);
}

/**
 * 取消借用题库
 * @param {string} id - 题库 ID
 * @returns {Promise<{code: number, message: string}>}
 */
export function unborrowTextbook(id) {
  console.log("[quiz_api] 取消借用题库，id:", id);
  return apiClient
    .delete("/quiz/market/" + id + "/borrow")
    .then((res) => res.data);
}

/**
 * 切换题库共享状态
 * @param {string} id - 题库 ID
 * @returns {Promise<{code: number, data: {isShared: boolean}}>}
 */
export function toggleShareTextbook(id) {
  console.log("[quiz_api] 切换共享状态，id:", id);
  return apiClient
    .put("/quiz/textbooks/" + id + "/share")
    .then((res) => res.data);
}

// ==================== 顺序刷题会话 ====================

/**
 * 开始或继续顺序刷题（按题目原始顺序出全部题目）
 * @param {string} textbookId - 题库 ID
 */
export function startSequentialSession(textbookId) {
  console.log("[quiz_api] 开始/继续顺序刷题，textbookId:", textbookId);
  return apiClient
    .post("/quiz/sequential-sessions", { textbookId })
    .then((res) => res.data);
}

/**
 * 获取顺序刷题会话详情
 * @param {string} sessionId - 会话 ID
 */
export function getSequentialSessionDetail(sessionId) {
  return apiClient
    .get("/quiz/sequential-sessions/" + sessionId)
    .then((res) => res.data);
}

/**
 * 保存顺序刷题进度
 * @param {string} sessionId - 会话 ID
 * @param {Object} payload - { currentQuestionIndex, questionId?, answer? }
 */
export function saveSequentialSessionProgress(sessionId, payload) {
  return apiClient
    .put("/quiz/sequential-sessions/" + sessionId + "/progress", payload)
    .then((res) => res.data);
}

/**
 * 顺序刷题交卷
 * @param {string} sessionId - 会话 ID
 */
export function completeSequentialSession(sessionId) {
  console.log("[quiz_api] 顺序刷题交卷，sessionId:", sessionId);
  return apiClient
    .post("/quiz/sequential-sessions/" + sessionId + "/complete")
    .then((res) => res.data);
}

// ==================== 文本粘贴导入 ====================

/**
 * AI 格式化题目文本（文本粘贴导入专用）
 * 将原始题目+答案混合文本发送给 DeepSeek AI，返回格式化的题目 JSON 数组
 * @param {Object} payload - { text: string, textbookName: string }
 * @returns {Promise<{code: number, data: {questions: Array}}>}
 */
export function formatQuizText(payload) {
  console.log("[quiz_api] AI 格式化题目文本，文本长度:", payload.text.length);
  return apiClient
    .post("/quiz/format-text", payload, {
      timeout: 900000, // 15 分钟超时（与后端 DeepSeek 大模型超时一致）
    })
    .then((res) => res.data);
}

// ==================== 题库详情页 ====================

/**
 * 获取题库统计数据（正确率、已做题数、错题数等）
 * @param {string} textbookId - 题库 ID
 * @returns {Promise<{code: number, data: {totalQuestions, doneCount, correctCount, accuracy, wrongCount}}>}
 */
export function getTextbookStats(textbookId) {
  console.log("[quiz_api] 获取题库统计，textbookId:", textbookId);
  return apiClient
    .get("/quiz/textbooks/" + textbookId + "/stats")
    .then((res) => res.data);
}

/**
 * 基于试卷开始顺序刷题
 * @param {string} examId - 试卷 ID
 * @returns {Promise<{code: number, data: {sessionId, examId, examName, totalCount, status, createdFrom}}>}
 */
export function startExamSequentialSession(examId) {
  console.log("[quiz_api] 开始基于试卷的顺序刷题，examId:", examId);
  return apiClient
    .post("/quiz/exams/" + examId + "/sequential-session")
    .then((res) => res.data);
}

/**
 * 基于试卷开始随机刷题
 * @param {string} examId - 试卷 ID
 * @returns {Promise<{code: number, data: {sessionId, examId, examName, totalCount, status, createdFrom}}>}
 */
export function startExamRandomSession(examId) {
  console.log("[quiz_api] 开始基于试卷的随机刷题，examId:", examId);
  return apiClient
    .post("/quiz/exams/" + examId + "/random-session")
    .then((res) => res.data);
}

/**
 * 删除单个试卷
 * @param {string} examId - 试卷 ID
 * @returns {Promise<{code: number, data: {deletedTextbook: boolean}}>}
 */
export function deleteExam(examId) {
  console.log("[quiz_api] 删除试卷，examId:", examId);
  return apiClient
    .delete("/quiz/exams/" + examId)
    .then((res) => res.data);
}
