// ==================== 教材相关 API 封装 ====================
// 职责：封装所有教材相关的 HTTP 请求
// 包含：上传教材文件、教材列表、教材详情、教材状态查询

import apiClient from "./client"; // 统一的 Axios 实例

// 日志前缀
const TAG = "[api_books]";

/**
 * 上传教材文件（multipart/form-data）
 * POST /api/v1/book/upload
 * @param {File} file - 教材文件对象（pdf/md/zip/rar/7z）
 * @param {Object} options - 可选的额外字段 { name?, description?, elaboration? }
 * @returns {Promise} 后端返回 { code, message, data: { book_id, ... } }
 */
export async function uploadBook(file, options = {}) {
  console.log(
    TAG + "[uploadBook] 请求上传文件: " + file.name + " (" + file.size + " bytes)"
  );

  // 构建 FormData，注意字段名必须与后端 multer 配置一致
  const formData = new FormData();
  formData.append("file", file); // multer 接收的字段名是 "file"

  // 附加可选的文本字段
  if (options.name) {
    formData.append("name", options.name);
  }
  if (options.description) {
    formData.append("description", options.description);
  }
  if (options.elaboration !== undefined) {
    formData.append("elaboration", String(options.elaboration));
  }

  // 文件上传使用 multipart/form-data，覆盖默认的 application/json
  const response = await apiClient.post("/book/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data", // 文件上传必须
    },
    timeout: 600000, // 10 分钟超时（大文件上传 + 后端处理需要时间）
  });

  console.log(TAG + "[uploadBook] 响应: code=" + response.data.code);
  return response.data;
}

/**
 * 获取教材列表
 * GET /api/v1/books
 * @param {Object} params - 查询参数 { page?, pageSize?, keyword? }
 * @returns {Promise} 后端返回 { code, message, data: { list, total, page, pageSize } }
 */
export async function listBooks(params = {}) {
  console.log(TAG + "[listBooks] 请求教材列表");

  const response = await apiClient.get("/books", { params });
  console.log(TAG + "[listBooks] 响应: code=" + response.data.code);

  return response.data;
}

/**
 * 获取教材详情
 * GET /api/v1/books/:id
 * @param {string|number} bookId - 教材 ID
 * @returns {Promise} 后端返回 { code, message, data: { ...教材完整信息 } }
 */
export async function getBookDetail(bookId) {
  console.log(TAG + "[getBookDetail] 请求教材详情，bookId: " + bookId);

  const response = await apiClient.get("/books/" + bookId);
  console.log(TAG + "[getBookDetail] 响应: code=" + response.data.code);

  return response.data;
}

/**
 * 查询教材流水线处理状态
 * GET /api/v1/book/:book_id/status
 * @param {string|number} bookId - 教材 ID
 * @returns {Promise} 后端返回 { code, message, data: { pipeline_status, elaboration_enabled, chapter } }
 */
export async function getBookStatus(bookId) {
  console.log(TAG + "[getBookStatus] 查询流水线状态，bookId: " + bookId);

  const response = await apiClient.get("/book/" + bookId + "/status");
  console.log(
    TAG +
      "[getBookStatus] 响应: code=" +
      response.data.code +
      ", pipeline_status=" +
      response.data?.data?.pipeline_status
  );

  return response.data;
}

/**
 * 获取教材文件列表（临时测试功能，未来会删除）
 * GET /api/v1/books/:id/files
 * @param {string|number} bookId - 教材 ID
 * @returns {Promise} 后端返回 { code, message, data: { courseId, courseName, directoryPrefix, totalFiles, files } }
 */
export async function getBookFiles(bookId) {
  console.log(TAG + "[getBookFiles] 请求教材文件列表，bookId: " + bookId);

  const response = await apiClient.get("/books/" + bookId + "/files");
  console.log(
    TAG +
      "[getBookFiles] 响应: code=" +
      response.data.code +
      ", totalFiles=" +
      (response.data?.data?.totalFiles || 0)
  );

  return response.data;
}

/**
 * 查询教材生成详细进度
 * GET /api/v1/book/:book_id/progress
 * @param {string|number} bookId - 教材 ID
 * @returns {Promise} 后端返回 { code, data: { courseId, pipelineStatus, progress: { phase, outlineProgress, elaborationProgress, filesProgress }, isTerminal } }
 */
export async function getCourseProgress(bookId) {
  console.log(TAG + "[getCourseProgress] 查询生成进度，bookId: " + bookId);

  const response = await apiClient.get("/book/" + bookId + "/progress");
  console.log(
    TAG +
      "[getCourseProgress] 响应: code=" +
      response.data.code +
      ", phase=" +
      response.data?.data?.progress?.phase
  );

  return response.data;
}

/**
 * 获取章节幻灯片数据（PPT/音频/字幕 URL 列表）
 * GET /api/v1/courses/:courseId/chapters/:chapterId/slides
 * @param {string|number} courseId - 课程 ID
 * @param {string|number} chapterId - 章节 ID
 * @returns {Promise} 后端返回 { code, message, data: { chapter, slides[] } }
 *   slides[]: { pageNumber, pptUrl, audioUrl, srtUrl }
 */
export async function getChapterSlides(courseId, chapterId) {
  console.log(TAG + "[getChapterSlides] 请求章节幻灯片，courseId: " + courseId + "，chapterId: " + chapterId);

  const response = await apiClient.get("/courses/" + courseId + "/chapters/" + chapterId + "/slides");
  console.log(
    TAG +
      "[getChapterSlides] 响应: code=" +
      response.data.code +
      ", slides=" +
      (response.data?.data?.slides?.length || 0) + " 页"
  );

  return response.data;
}

/**
 * 触发生成下一章
 * POST /api/v1/courses/:courseId/generate-next-chapter
 * @param {string|number} courseId - 课程 ID
 * @returns {Promise} 后端返回 { code, message, data: { chapterId, sequence, name, status } }
 */
export async function generateNextChapter(courseId) {
  console.log(TAG + "[generateNextChapter] 请求生成下一章，courseId: " + courseId);

  const response = await apiClient.post("/courses/" + courseId + "/generate-next-chapter");
  console.log(
    TAG +
      "[generateNextChapter] 响应: code=" +
      response.data.code +
      ", chapterId=" +
      response.data?.data?.chapterId
  );

  return response.data;
}

/**
 * 查询"生成下一章"按钮状态（轮询用）
 * GET /api/v1/courses/:courseId/generate-next-chapter/status
 * @param {string|number} courseId - 课程 ID
 * @returns {Promise} 后端返回 { code, data: { courseId, canGenerateNext, isGenerating, reason } }
 *   canGenerateNext: 是否还能生成下一章
 *   isGenerating: 是否存在正在生成中的章节
 */
export async function getGenerateNextStatus(courseId) {
  const response = await apiClient.get("/courses/" + courseId + "/generate-next-chapter/status");
  // 轮询接口日志频率高，仅打印状态变化关键值
  console.log(
    TAG + "[getGenerateNextStatus] 响应: code=" + response.data.code +
    ", canGenerateNext=" + response.data?.data?.canGenerateNext +
    ", isGenerating=" + response.data?.data?.isGenerating
  );
  return response.data;
}

/**
 * 查询章节生成进度（轮询用）
 * GET /api/v1/courses/:courseId/chapters/:chapterId/generation-progress
 * @param {string|number} courseId - 课程 ID
 * @param {string|number} chapterId - 章节 ID
 * @returns {Promise} 后端返回 { code, data: { chapterId, chapterStatus, progress, isTerminal } }
 */
export async function getChapterGenerationProgress(courseId, chapterId) {
  const response = await apiClient.get(
    "/courses/" + courseId + "/chapters/" + chapterId + "/generation-progress"
  );
  // 轮询接口日志频率高，不打印完整日志
  if (response.data?.data?.isTerminal) {
    console.log(TAG + "[getChapterGenerationProgress] 章节 " + chapterId + " 已结束（isTerminal）");
  }
  return response.data;
}

/**
 * 触发文件补全任务
 * POST /api/v1/courses/:courseId/chapters/:chapterId/fix-missing
 * @param {string|number} courseId - 课程 ID
 * @param {string|number} chapterId - 章节 ID
 * @returns {Promise} 后端返回 { code, message, data: { status, missingFiles[] } }
 */
export async function fixMissingFiles(courseId, chapterId) {
  console.log(TAG + "[fixMissingFiles] 触发文件补全，chapterId: " + chapterId);

  const response = await apiClient.post(
    "/courses/" + courseId + "/chapters/" + chapterId + "/fix-missing"
  );
  console.log(
    TAG + "[fixMissingFiles] 响应: code=" + response.data.code +
    ", status=" + response.data?.data?.status
  );

  return response.data;
}

/**
 * 查询文件补全状态（轮询用）
 * GET /api/v1/courses/:courseId/chapters/:chapterId/fix-status
 * @param {string|number} courseId - 课程 ID
 * @param {string|number} chapterId - 章节 ID
 * @returns {Promise} 后端返回 { code, data: { isFixing, missingFiles[] } }
 */
export async function getFixStatus(courseId, chapterId) {
  const response = await apiClient.get(
    "/courses/" + courseId + "/chapters/" + chapterId + "/fix-status"
  );
  return response.data;
}

/**
 * 检查 PDF 文件页数（上传前预检，纯本地读取，毫秒级）
 * POST /api/v1/book/check-pdf-pages
 * @param {File} file - PDF 文件对象
 * @returns {Promise} 后端返回 { code, message, data: { pageCount, fileName } }
 */
export async function checkPdfPages(file) {
  console.log(TAG + "[checkPdfPages] 请求检查 PDF 页数: " + file.name);

  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post("/book/check-pdf-pages", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    timeout: 30000, // 30 秒超时（小文件上传，不需要很长时间）
  });

  console.log(
    TAG +
      "[checkPdfPages] 响应: code=" +
      response.data.code +
      ", pageCount=" +
      response.data?.data?.pageCount
  );

  return response.data;
}

/**
 * 生成课程复习提纲
 * POST /api/v1/courses/:courseId/review-outline
 * @param {string|number} courseId - 课程 ID
 * @returns {Promise} 后端返回 { code, message, data: { courseId, outline } }
 */
export async function generateReviewOutline(courseId) {
  console.log(TAG + "[generateReviewOutline] 生成复习提纲，courseId: " + courseId);
  const response = await apiClient.post("/courses/" + courseId + "/review-outline");
  return response.data;
}

/**
 * 生成章节测验
 * POST /api/v1/courses/:courseId/chapters/:chapterId/quiz
 * @param {string|number} courseId - 课程 ID
 * @param {string|number} chapterId - 章节 ID
 * @returns {Promise} 后端返回 { code, message, data: { courseId, chapterId, chapterName, questions } }
 */
export async function generateChapterQuiz(courseId, chapterId) {
  console.log(TAG + "[generateChapterQuiz] 生成章节测验，chapterId: " + chapterId);
  const response = await apiClient.post("/courses/" + courseId + "/chapters/" + chapterId + "/quiz");
  return response.data;
}

/**
 * 获取课程思维导图数据
 * GET /api/v1/courses/:courseId/mindmap
 * @param {string|number} courseId - 课程 ID
 * @returns {Promise} 后端返回 { code, message, data: { courseId, courseName, chapters } }
 */
export async function getCourseMindMap(courseId) {
  console.log(TAG + "[getCourseMindMap] 获取思维导图，courseId: " + courseId);
  const response = await apiClient.get("/courses/" + courseId + "/mindmap");
  return response.data;
}

/**
 * 查询课程是否已收藏
 * GET /api/v1/courses/:courseId/favorite-status
 */
export async function getFavoriteStatus(courseId) {
  const response = await apiClient.get("/courses/" + courseId + "/favorite-status");
  return response.data;
}

/**
 * 收藏课程
 * POST /api/v1/courses/:courseId/favorite
 */
export async function addFavorite(courseId) {
  const response = await apiClient.post("/courses/" + courseId + "/favorite");
  return response.data;
}

/**
 * 取消收藏
 * DELETE /api/v1/courses/:courseId/favorite
 */
export async function removeFavorite(courseId) {
  const response = await apiClient.delete("/courses/" + courseId + "/favorite");
  return response.data;
}

/**
 * 获取收藏课程列表
 * GET /api/v1/favorites
 * @param {Object} params - { page?, pageSize? }
 */
export async function getFavorites(params = {}) {
  const response = await apiClient.get("/favorites", { params });
  return response.data;
}

/**
 * 查询课程结业状态
 * GET /api/v1/courses/:courseId/certificate-status
 */
export async function getCertificateStatus(courseId) {
  const response = await apiClient.get("/courses/" + courseId + "/certificate-status");
  return response.data;
}
