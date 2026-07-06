// ==================== Axios HTTP 客户端封装 ====================
// 职责：创建统一的 Axios 实例，配置请求/响应拦截器
// 请求拦截器：自动附加 JWT Token
// 响应拦截器：统一处理 401 未授权错误

import axios from "axios"; // HTTP 请求库

// 日志前缀
const TAG = "[api_client]";

// ========== 创建 Axios 实例 ==========
// 开发模式下 baseURL 为 /api/v1，Vite proxy 自动转发到后端 8888
// 生产模式下由于前后端同端口部署，/api/v1 直接命中 Express 路由
const apiClient = axios.create({
  baseURL: "/api/v1", // API 基础路径
  timeout: 30000, // 请求超时时间：30 秒（兼顾文件上传等耗时操作）
  headers: {
    "Content-Type": "application/json", // 默认 JSON 请求体
  },
});

// ========== 请求拦截器：自动附加 JWT Token ==========
apiClient.interceptors.request.use(
  (config) => {
    // 从 localStorage 读取 token
    const token = localStorage.getItem("token");
    if (token) {
      // 附加 Bearer Token 到请求头
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    // 请求配置错误（极少发生）
    console.error(TAG + "[request] 请求拦截错误: " + error.message);
    return Promise.reject(error);
  }
);

// ========== 响应拦截器：统一处理错误 ==========
apiClient.interceptors.response.use(
  // 成功响应：直接返回
  (response) => {
    return response;
  },
  // 错误响应：统一处理
  (error) => {
    if (error.response) {
      const { status, data } = error.response;

      // 401 未授权：Token 过期或无效
      if (status === 401) {
        console.warn(TAG + "[response] 401 未授权，清除 token 并跳转登录页");
        localStorage.removeItem("token");
        // 跳转到登录页（后续页面开发后生效）
        window.location.href = "/login";
      }

      // 打印服务端返回的错误信息（便于调试）
      console.error(
        TAG +
          "[response] 请求失败: " +
          status +
          " " +
          (data?.message || error.message)
      );
    } else if (error.request) {
      // 请求已发出但未收到响应（网络错误）
      console.error(TAG + "[response] 网络错误: " + error.message);
    } else {
      // 请求创建时发生错误
      console.error(TAG + "[response] 请求错误: " + error.message);
    }

    return Promise.reject(error);
  }
);

// ========== 导出实例 ==========
export default apiClient;
