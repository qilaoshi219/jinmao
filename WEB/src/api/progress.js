// ==================== 学习进度 API 封装 ====================
// 职责：封装所有学习进度相关的 HTTP 请求
// 包含：保存进度、获取单个课程进度、获取所有课程进度

import apiClient from "./client"; // 统一的 Axios 实例

// 日志前缀
const TAG = "[api_progress]";

/**
 * 保存学习进度（自动 upsert）
 * PUT /api/v1/progress
 * @param {Object} params - 进度参数
 * @param {string|number} params.courseId - 课程 ID
 * @param {string|number} params.chapterId - 章节 ID
 * @param {number} params.progress - 当前页码（1-based）
 * @returns {Promise} 后端返回 { code, message, data: { id, courseId, chapterId, progress, updateTime } }
 */
export async function saveProgress({ courseId, chapterId, progress }) {
  console.log(
    TAG + "[saveProgress] 保存学习进度，courseId: " + courseId +
    "，chapterId: " + chapterId + "，progress: " + progress
  );

  const response = await apiClient.put("/progress", {
    courseId: String(courseId),
    chapterId: String(chapterId),
    progress: progress,
  });

  console.log(TAG + "[saveProgress] 响应: code=" + response.data.code);
  return response.data;
}

/**
 * 获取单个课程的学习进度
 * GET /api/v1/progress?courseId=xxx
 * @param {string|number} courseId - 课程 ID
 * @returns {Promise} 后端返回 { code, message, data: { courseId, chapterId, chapterName, progress, totalPages, updateTime } }
 *   - code 200: 有学习记录
 *   - code 404: 没有学习记录（前端应视为从头开始）
 */
export async function getProgress(courseId) {
  console.log(TAG + "[getProgress] 查询学习进度，courseId: " + courseId);

  const response = await apiClient.get("/progress", {
    params: { courseId: String(courseId) },
  });

  console.log(
    TAG + "[getProgress] 响应: code=" + response.data.code +
    (response.data.data ? "，章节: " + response.data.data.chapterName + "，页码: " + response.data.data.progress : "")
  );
  return response.data;
}

/**
 * 获取所有课程的学习进度摘要
 * GET /api/v1/progress
 * @returns {Promise} 后端返回 { code, message, data: [{ courseId, courseName, chapterId, chapterName, progress, totalPages, updateTime }] }
 */
export async function getAllProgress() {
  console.log(TAG + "[getAllProgress] 查询所有课程学习进度");

  const response = await apiClient.get("/progress");
  console.log(
    TAG + "[getAllProgress] 响应: code=" + response.data.code +
    "，记录数: " + (response.data.data?.length || 0)
  );

  return response.data;
}
