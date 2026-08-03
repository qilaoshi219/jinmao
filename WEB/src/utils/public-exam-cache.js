// ==================== 公开考试本地缓存工具 ====================
// 职责：
// 1. 设备级游客身份标识（anonymousKey）——换浏览器/清缓存视为新游客
// 2. 作答草稿缓存——防止做到一半退出/断网导致进度丢失

// ==================== 游客身份标识 ====================

const GUEST_KEY = "jinmao_public_exam_guest_id";

/**
 * 获取（或生成）设备级游客身份标识
 * @returns {string}
 */
export function getGuestKey() {
  let key = localStorage.getItem(GUEST_KEY);
  if (key && /^[A-Za-z0-9_-]{6,64}$/.test(key)) return key;

  key = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? "g_" + crypto.randomUUID().replace(/-/g, "")
    : "g_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  localStorage.setItem(GUEST_KEY, key);
  return key;
}

// ==================== 作答草稿缓存 ====================

const DRAFT_PREFIX = "jinmao_public_exam_draft_";

/**
 * 保存作答草稿到本地
 * @param {string} token - 考试标识
 * @param {Object} draft - { sessionId, currentIndex, answers }
 */
export function saveDraft(token, draft) {
  try {
    localStorage.setItem(DRAFT_PREFIX + token, JSON.stringify(draft));
  } catch (error) {
    console.warn("[public_exam_cache] 保存草稿失败: " + error.message);
  }
}

/**
 * 读取作答草稿
 * @param {string} token
 * @returns {Object|null}
 */
export function getDraft(token) {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + token);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.sessionId) return parsed;
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * 清除作答草稿（交卷成功后）
 * @param {string} token
 */
export function clearDraft(token) {
  localStorage.removeItem(DRAFT_PREFIX + token);
}
