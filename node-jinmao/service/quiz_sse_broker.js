// ==================== SSE 消息推送代理 ====================
// 职责：内存级的发布/订阅模式，支持前端通过 SSE 实时获取报告判题进度
// 移植自金毛刷题 test/金毛刷题/backend/src/modules/quiz/grading-stream-broker.ts

// 日志前缀
const TAG = "[quiz_sse]";

// ==================== 订阅者存储 ====================

/**
 * 订阅者 Map：reportId → Set<callbacks[]>
 * 每个报告可以有多个 SSE 连接订阅
 */
const subscribers = new Map();

// ==================== 公开 API ====================

/**
 * 添加 SSE 订阅者
 *
 * @param {string} reportId - 报告 ID
 * @param {Object} callbacks - 回调函数集合
 * @param {Function} callbacks.send - 发送 SSE 事件的函数
 * @param {Function} callbacks.close - 关闭连接时调用的函数
 * @returns {number} 当前报告的订阅者总数
 */
function addSubscriber(reportId, callbacks) {
  if (!subscribers.has(reportId)) {
    subscribers.set(reportId, new Set());
  }

  const reportSubscribers = subscribers.get(reportId);
  reportSubscribers.add(callbacks);

  console.log(TAG + " 添加 SSE 订阅者 — reportId: " + reportId + ", 当前订阅者: " + reportSubscribers.size);
  return reportSubscribers.size;
}

/**
 * 移除 SSE 订阅者
 *
 * @param {string} reportId - 报告 ID
 * @param {Object} callbacks - 回调函数集合（与 addSubscriber 传入的相同引用）
 */
function removeSubscriber(reportId, callbacks) {
  if (!subscribers.has(reportId)) return;

  const reportSubscribers = subscribers.get(reportId);
  reportSubscribers.delete(callbacks);

  console.log(TAG + " 移除 SSE 订阅者 — reportId: " + reportId + ", 剩余: " + reportSubscribers.size);

  // 如果该报告没有订阅者了，清理空 Set
  if (reportSubscribers.size === 0) {
    subscribers.delete(reportId);
    console.log(TAG + " 报告 " + reportId + " 无订阅者，已清理。");
  }
}

/**
 * 发布报告快照到所有订阅者
 *
 * @param {string} reportId - 报告 ID
 * @param {Object} snapshot - 报告快照数据
 */
function publishQuizReportSnapshot(reportId, snapshot) {
  if (!subscribers.has(reportId)) return;

  const reportSubscribers = subscribers.get(reportId);
  const data = JSON.stringify(snapshot);

  // 向所有订阅者发送 SSE 事件
  for (const callbacks of reportSubscribers) {
    try {
      callbacks.send(data);
    } catch (error) {
      console.error(TAG + " SSE 发送失败 — reportId: " + reportId + ": " + error.message);
    }
  }
}

/**
 * 获取报告订阅者数量
 *
 * @param {string} reportId
 * @returns {number}
 */
function getSubscriberCount(reportId) {
  if (!subscribers.has(reportId)) return 0;
  return subscribers.get(reportId).size;
}

module.exports = {
  addSubscriber,
  removeSubscriber,
  publishQuizReportSnapshot,
  getSubscriberCount,
};
