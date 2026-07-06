// ==================== localStorage 工具封装 ====================
// 职责：统一管理前端本地存储操作，避免各处直接操作 localStorage
// 好处：键名统一管理、易于切换存储方案（如 IndexedDB）、便于测试

// ========== 存储键名常量 ==========
// 所有键名集中定义，避免硬编码字符串分散在各处
const KEYS = {
  TOKEN: "token", // JWT 认证 Token
};

// ========== Token 存取操作 ==========

/**
 * 获取存储的 JWT Token
 * @returns {string|null} Token 字符串，不存在时返回 null
 */
export function getToken() {
  return localStorage.getItem(KEYS.TOKEN);
}

/**
 * 保存 JWT Token
 * @param {string} token - JWT Token 字符串
 */
export function setToken(token) {
  if (!token) {
    console.warn("[storage] setToken: token 为空，跳过存储");
    return;
  }
  localStorage.setItem(KEYS.TOKEN, token);
}

/**
 * 删除 JWT Token（登出时调用）
 */
export function removeToken() {
  localStorage.removeItem(KEYS.TOKEN);
}

// ========== 通用存取操作 ==========

/**
 * 通用获取值
 * @param {string} key - 键名
 * @returns {string|null}
 */
export function get(key) {
  return localStorage.getItem(key);
}

/**
 * 通用设置值
 * @param {string} key - 键名
 * @param {string} value - 值
 */
export function set(key, value) {
  localStorage.setItem(key, value);
}

/**
 * 通用删除值
 * @param {string} key - 键名
 */
export function remove(key) {
  localStorage.removeItem(key);
}

// ========== 导出键名常量（供需要自定义 key 的场景使用） ==========
export { KEYS };
