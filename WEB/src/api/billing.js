// ==================== 账单 API 封装 ====================
// 职责：封装账单查询相关的 HTTP 请求，供账单页面和侧边栏使用
// 所有请求自动携带 JWT Bearer Token（由 client.js 拦截器注入）
// 注意：充值功能已迁移到兑换码系统（api/redeem.js），此处仅保留账单查询

import apiClient from "./client"; // Axios 实例（baseURL: /api/v1）

// 日志前缀
const TAG = "[billing_api]";

/**
 * 获取当前用户的账单信息（含账务摘要 + 扣费记录分页列表 + 充值记录分页列表）
 * @param {number} page - 页码（从 1 开始，默认 1）
 * @param {number} pageSize - 每页记录数（默认 20，最大 100）
 * @param {number} rechargePage - 充值记录页码（从 1 开始，默认 1）
 * @param {number} rechargePageSize - 充值记录每页条数（默认 20，最大 100）
 * @returns {Promise<Object>} 账单信息 { vipLevel, plan, balance, totalUsed, records[], pagination, rechargeRecords[], rechargePagination }
 */
export async function getBilling(page = 1, pageSize = 20, rechargePage = 1, rechargePageSize = 20) {
  console.log(TAG + " 请求账单信息: page=" + page + ", pageSize=" + pageSize +
    ", rechargePage=" + rechargePage + ", rechargePageSize=" + rechargePageSize);
  const { data } = await apiClient.get("/billing", {
    params: { page, pageSize, rechargePage, rechargePageSize },
  });
  console.log(TAG + " 账单数据已获取: code=" + data.code);
  return data;
}
