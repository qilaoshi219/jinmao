// ==================== 兑换码 API 封装 ====================
// 职责：封装兑换码兑换相关的 HTTP 请求
// 所有请求自动携带 JWT Bearer Token（由 client.js 拦截器注入）

import apiClient from "./client"; // Axios 实例（baseURL: /api/v1）

// 日志前缀
const TAG = "[redeem_api]";

/**
 * 兑换码兑换余额
 * @param {string} code - 兑换码（24位大写十六进制字符串）
 * @returns {Promise<Object|null>} { code, message, data: { amount, balance, balanceLocked } }
 *   失败时返回 null
 */
export async function redeemCode(code) {
  console.log(TAG + " 发起兑换请求: code=" + code.substring(0, 8) + "***");
  try {
    const { data } = await apiClient.post("/redeem", { code });
    console.log(TAG + " 兑换结果: code=" + data.code + ", message=" + data.message);
    return data;
  } catch (err) {
    // 网络错误或服务器错误
    console.error(TAG + " 兑换请求失败: " + (err.response?.data?.message || err.message));
    // 如果服务端返回了错误响应，提取消息
    if (err.response?.data) {
      return err.response.data;
    }
    return null;
  }
}
