// ==================== 公开考试（二维码考试）API 封装 ====================
// 职责：公开考试的发布管理（所有者）与免登录考试接口
// 使用独立的 axios 实例：有 Token 自动附带（登录考生绑定账号），
// 无 Token 正常放行（游客），401 不会跳转登录页

import axios from "axios";

// ==================== 独立 axios 实例 ====================
const publicClient = axios.create({
  baseURL: "/api/v1",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// 请求拦截：有 token 则附带（登录考生自动绑定账号）
publicClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：把服务端返回的 message 透传给调用方（如"余额不足，暂不启用AI判题"）
publicClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const serverMessage = error?.response?.data?.message;
    if (serverMessage) {
      error.message = serverMessage;
    }
    return Promise.reject(error);
  }
);

// ==================== 发布与管理（所有者） ====================

/**
 * 发布/更新公开考试
 * @param {Object} payload - { examId, durationMinutes, essayMode, essayKeywords?, shuffle? }
 */
export function publishExam(payload) {
  return publicClient.post("/quiz/public-exams/publish", payload).then((res) => res.data);
}

/**
 * 获取发布表单数据（试卷简答题列表 + 已发布配置）
 * @param {string} examId
 */
export function getPublishForm(examId) {
  return publicClient.get("/quiz/public-exams/exam-info", { params: { examId } }).then((res) => res.data);
}

/**
 * 停止/恢复考试
 * @param {string} token
 * @param {'published'|'closed'} status
 */
export function setExamStatus(token, status) {
  return publicClient.post("/quiz/public-exams/" + token + "/status", { status }).then((res) => res.data);
}

/**
 * 取消发布（软删除）
 * @param {string} token
 */
export function unpublishExam(token) {
  return publicClient.delete("/quiz/public-exams/" + token).then((res) => res.data);
}

/**
 * 考试统计数据（所有者）
 * @param {string} token
 * @param {Object} params - { page, pageSize }
 */
export function getExamStats(token, params = {}) {
  return publicClient.get("/quiz/public-exams/" + token + "/stats", { params }).then((res) => res.data);
}

/**
 * 我的公开考试列表（"选择考试"页）
 * @param {Object} params - { page, pageSize }
 */
export function listMyPublicExams(params = {}) {
  return publicClient.get("/quiz/public-exams/my", { params }).then((res) => res.data);
}

// ==================== 免登录考试接口 ====================

/**
 * 获取考试信息（入场页）
 * @param {string} token
 */
export function getPublicInfo(token) {
  return publicClient.get("/quiz/public-exams/" + token).then((res) => res.data);
}

/**
 * 开始/续做考试
 * @param {string} token
 * @param {string|null} anonymousKey - 游客身份标识
 */
export function startPublicExam(token, anonymousKey) {
  return publicClient
    .post("/quiz/public-exams/" + token + "/start", { anonymousKey: anonymousKey || undefined })
    .then((res) => res.data);
}

/**
 * 获取答题页详情
 * @param {string} token
 * @param {string} sessionId
 * @param {string|null} anonymousKey
 */
export function getPublicSessionDetail(token, sessionId, anonymousKey) {
  return publicClient
    .get("/quiz/public-exams/" + token + "/session/" + sessionId, {
      params: { anonymousKey: anonymousKey || undefined },
    })
    .then((res) => res.data);
}

/**
 * 保存作答进度
 * @param {string} token
 * @param {string} sessionId
 * @param {Object} payload - { anonymousKey?, currentQuestionIndex, questionId?, answer? }
 */
export function savePublicProgress(token, sessionId, payload) {
  return publicClient
    .put("/quiz/public-exams/" + token + "/session/" + sessionId + "/progress", payload)
    .then((res) => res.data);
}

/**
 * 交卷
 * @param {string} token
 * @param {string} sessionId
 * @param {string|null} anonymousKey
 */
export function completePublicExam(token, sessionId, anonymousKey) {
  return publicClient
    .post("/quiz/public-exams/" + token + "/session/" + sessionId + "/complete", {
      anonymousKey: anonymousKey || undefined,
    })
    .then((res) => res.data);
}

/**
 * 查询交卷结果（AI 简答批改轮询用）
 * @param {string} token
 * @param {string} sessionId
 * @param {string|null} anonymousKey
 */
export function getPublicResult(token, sessionId, anonymousKey) {
  return publicClient
    .get("/quiz/public-exams/" + token + "/session/" + sessionId + "/result", {
      params: { anonymousKey: anonymousKey || undefined },
    })
    .then((res) => res.data);
}

export default publicClient;
