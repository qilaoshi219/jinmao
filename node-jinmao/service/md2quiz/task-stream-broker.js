// ==================== SSE 事件广播器 ====================
// 职责：管理任务状态快照的订阅/取消订阅/广播，供服务端内部 SSE 流使用
// 当前版本前端采用轮询方式获取进度，本模块保留用于后端内部事件通知
// 移植自 test/金毛刷题/backend/src/modules/markdown-json-test/task-stream-broker.ts

const TAG = "[md2quiz_broker]";

/**
 * 任务快照回调类型
 * @callback SnapshotCallback
 * @param {Object} taskSnapshot - 任务快照数据
 */

/** @type {Map<string, Set<SnapshotCallback>>} */
const subscriberMap = new Map();

/**
 * 订阅任务状态变化
 * @param {string} taskId           - 任务 ID
 * @param {SnapshotCallback} callback - 状态变化回调
 * @returns {() => void} 取消订阅函数
 */
function subscribeTaskStream(taskId, callback) {
  if (!subscriberMap.has(taskId)) {
    subscriberMap.set(taskId, new Set());
  }

  subscriberMap.get(taskId).add(callback);

  console.log(TAG + " 新订阅者加入，taskId: " + taskId);

  // 返回取消订阅函数
  return () => {
    const subs = subscriberMap.get(taskId);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) {
        subscriberMap.delete(taskId);
      }
    }
  };
}

/**
 * 向所有订阅者广播任务最新快照
 * @param {string} taskId
 * @param {Object} taskSnapshot - 任务快照
 */
function publishTaskSnapshot(taskId, taskSnapshot) {
  const subs = subscriberMap.get(taskId);
  if (!subs || subs.size === 0) return;

  // 遍历订阅者并通知（捕获异常防止单个订阅者崩溃影响其他）
  subs.forEach((callback) => {
    try {
      callback(taskSnapshot);
    } catch (err) {
      console.error(TAG + " 广播任务快照时发生异常", {
        taskId,
        error: err.message,
      });
    }
  });
}

module.exports = { subscribeTaskStream, publishTaskSnapshot };
