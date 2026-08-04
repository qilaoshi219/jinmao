// ==================== 思维导图 API 封装 ====================
// 职责：封装课程学习页一键思维导图的 HTTP 请求
// 包含：触发生成（异步后台）、查询生成状态/URL（轮询用）

import apiClient from "./client"; // 统一的 Axios 实例

// 日志前缀
const TAG = "[api_mindmap]";

/**
 * 触发指定章节的思维导图异步生成
 * POST /api/v1/courses/:courseId/chapters/:chapterId/mindmap
 * @param {string|number} courseId - 课程 ID
 * @param {string|number} chapterId - 章节 ID
 * @returns {Promise} 后端返回 { code, message, data: { status: "generating" } }
 */
export async function generateMindmap(courseId, chapterId) {
  console.log(TAG + "[generateMindmap] 请求生成思维导图，courseId: " + courseId + "，chapterId: " + chapterId);
  const response = await apiClient.post("/courses/" + courseId + "/chapters/" + chapterId + "/mindmap");
  return response.data;
}

/**
 * 查询指定章节的思维导图状态（轮询用）
 * GET /api/v1/courses/:courseId/chapters/:chapterId/mindmap
 * @param {string|number} courseId - 课程 ID
 * @param {string|number} chapterId - 章节 ID
 * @returns {Promise} 后端返回 { code, message, data: { status, progressText?, error?, mindmapUrl? } }
 *   status: none（未生成）/ generating（生成中）/ done（已生成，含 mindmapUrl）/ failed（失败，含 error）
 */
export async function getMindmapStatus(courseId, chapterId) {
  const response = await apiClient.get("/courses/" + courseId + "/chapters/" + chapterId + "/mindmap");
  return response.data;
}
