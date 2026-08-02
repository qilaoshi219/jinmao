// ==================== 认证相关 API 封装 ====================
// 职责：封装所有认证相关的 HTTP 请求
// 包含：发送验证码、登录/注册、获取用户信息、更新用户信息

import apiClient from "./client"; // 统一的 Axios 实例

// 日志前缀
const TAG = "[api_auth]";

/**
 * 发送邮箱验证码
 * POST /api/v1/smtpcode
 * @param {string} email - 用户邮箱地址
 * @returns {Promise} 后端返回 { code, message }
 */
export async function sendCode(email) {
  console.log(TAG + "[sendCode] 请求发送验证码，邮箱: " + email);

  const response = await apiClient.post("/smtpcode", { email });
  console.log(TAG + "[sendCode] 响应: code=" + response.data.code);

  return response.data;
}

/**
 * 验证码登录/注册
 * POST /api/v1/login
 * 后台自动判断新用户注册还是老用户登录
 * @param {string} email - 用户邮箱地址
 * @param {string} code - 6位数字验证码
 * @returns {Promise} 后端返回 { code, message, data: { user_id, token, is_new_user } }
 */
export async function login(email, code) {
  console.log(TAG + "[login] 请求登录，邮箱: " + email);

  const response = await apiClient.post("/login", { email, code });
  console.log(
    TAG +
      "[login] 响应: code=" +
      response.data.code +
      ", is_new_user=" +
      response.data?.data?.is_new_user
  );

  return response.data;
}

/**
 * 获取当前用户信息（需要 JWT Token）
 * GET /api/v1/auth/profile
 * @returns {Promise} 后端返回 { code, message, data: { id, username, nickname, email, phone, role, create_time } }
 */
export async function getProfile() {
  console.log(TAG + "[getProfile] 请求获取用户信息");

  const response = await apiClient.get("/auth/profile");
  console.log(TAG + "[getProfile] 响应: code=" + response.data.code);

  return response.data;
}

/**
 * 更新当前用户信息（需要 JWT Token + 邮箱验证码）
 * PUT /api/v1/auth/profile
 * @param {Object} fields - 待更新的字段 { nickname?, phone?, password?, code }
 * @returns {Promise} 后端返回 { code, message, data: { ...用户完整信息 } }
 */
export async function updateProfile(fields) {
  console.log(TAG + "[updateProfile] 请求更新用户信息");

  const response = await apiClient.put("/auth/profile", fields);
  console.log(TAG + "[updateProfile] 响应: code=" + response.data.code);

  return response.data;
}

/**
 * 上传用户头像
 * POST /api/v1/auth/avatar
 * @param {File} file - 图片文件对象
 * @returns {Promise} 后端返回 { code, message, data: { avatar: "url" } }
 */
export async function uploadAvatar(file) {
  console.log(TAG + "[uploadAvatar] 请求上传头像");

  const formData = new FormData();
  formData.append("avatar", file);

  const response = await apiClient.post("/auth/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  console.log(TAG + "[uploadAvatar] 响应: code=" + response.data.code);

  return response.data;
}
