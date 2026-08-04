// ==================== 统计数据 API 封装 ====================
// 职责：封装首页统计数据相关的 HTTP 请求
// 端点：GET /api/v1/stats — 获取首页 4 项统计指标

import apiClient from "./client"; // 统一的 Axios 实例

// 日志前缀
const TAG = "[api_stats]";

/**
 * 获取首页统计数据
 * GET /api/v1/stats
 * @returns {Promise<{ code: number, data: { totalStudyDuration, completedChapters, quizAccuracy, totalQuizCount, correctQuizCount, consecutiveDays } }>}
 */
export async function getStats() {
  console.log(TAG + "[getStats] 获取首页统计数据");

  const response = await apiClient.get("/stats");
  console.log(
    TAG + "[getStats] 响应: code=" + response.data.code +
    (response.data.data
      ? "，学习时长: " + response.data.data.totalStudyDuration + "s" +
        "，已完成章节: " + response.data.data.completedChapters +
        "，正确率: " + response.data.data.quizAccuracy + "%" +
        "，连续天数: " + response.data.data.consecutiveDays
      : "")
  );

  return response.data;
}
