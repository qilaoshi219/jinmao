// ==================== 教材相关 API 封装 ====================
// 职责：封装所有教材相关的 HTTP 请求
// 包含：上传教材文件、教材列表、教材详情、教材状态查询

import apiClient from "./client"; // 统一的 Axios 实例

// 日志前缀
const TAG = "[api_books]";

/**
 * 上传教材文件（multipart/form-data）
 * POST /api/v1/book/upload
 * @param {File} file - 教材文件对象（pdf/docx/doc/md/zip/rar/7z）
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
