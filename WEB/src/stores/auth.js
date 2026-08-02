// ==================== Pinia 认证状态管理 Store ====================
// 职责：全局管理用户认证状态（Token、用户信息、登录/登出操作）
// 使用 Composition API 风格定义 Store（推荐写法）

import { defineStore } from "pinia"; // Pinia 状态管理
import { ref, computed } from "vue"; // Vue 响应式 API
import { getToken, setToken, removeToken } from "../utils/storage"; // Token 存储工具
import { login as loginApi, getProfile as getProfileApi } from "../api/auth"; // 认证 API

// 日志前缀
const TAG = "[store_auth]";

/**
 * 使用 Composition API 风格定义 auth Store
 * 优点：类型推导更准确、逻辑复用更方便
 */
export const useAuthStore = defineStore("auth", () => {
  // ========== 状态（State） ==========

  // JWT Token（应用初始化时从 localStorage 恢复，实现刷新不丢失登录态）
  const token = ref(getToken());

  // 当前登录用户信息（null 表示未加载或未登录）
  const user = ref(null);

  // ========== 计算属性（Getters） ==========

  // 是否已登录（有 token 即视为已登录）
  const isLoggedIn = computed(() => !!token.value);

  // ========== 方法（Actions） ==========

  /**
   * 登录/注册
   * 调用后端验证码登录接口，成功后将 token 存入 localStorage 和 store
   * @param {string} email - 用户邮箱
   * @param {string} code - 6位验证码
   * @returns {Promise<Object>} 后端返回的完整结果 { code, message, data }
   */
  async function login(email, code) {
    console.log(TAG + "[login] 开始登录，邮箱: " + email);

    const result = await loginApi(email, code);

    if (result.code === 200) {
      // 登录成功，更新 store 状态
      const { token: newToken, user_id, is_new_user } = result.data;

      token.value = newToken;
      setToken(newToken); // 持久化到 localStorage

      user.value = {
        id: user_id,
        isNewUser: is_new_user,
      };

      console.log(
        TAG +
          "[login] 登录成功，userId: " +
          user_id +
          (is_new_user ? "（新用户注册）" : "（老用户登录）")
      );
    } else {
      console.warn(TAG + "[login] 登录失败: " + result.message);
    }

    return result;
  }

  /**
   * 获取当前用户完整信息
   * 调用后端 profile 接口，获取用户名、昵称、手机号等详细信息
   * @returns {Promise<Object>} 后端返回的完整结果
   */
  async function fetchProfile() {
    console.log(TAG + "[fetchProfile] 请求用户信息");

    const result = await getProfileApi();

    if (result.code === 200) {
      // 合并更新用户信息（保留已有的 login 返回信息）
      user.value = {
        ...user.value,
        ...result.data,
      };
      console.log(TAG + "[fetchProfile] 用户信息获取成功");
    } else {
      console.warn(TAG + "[fetchProfile] 获取用户信息失败: " + result.message);
    }

    return result;
  }

  /**
   * 登出
   * 清除 store 中的所有状态和 localStorage 中的 token
   */
  function logout() {
    console.log(TAG + "[logout] 用户登出");

    token.value = null;
    user.value = null;
    removeToken();
  }

  /**
   * 更新用户单个字段（无需请求后端，仅更新本地状态）
   * 用于头像上传后立即反映到 UI
   * @param {string} key - 字段名
   * @param {any} value - 字段值
   */
  function updateUserField(key, value) {
    if (user.value) {
      user.value = { ...user.value, [key]: value };
    }
  }

  // ========== 导出给外部使用的状态和方法 ==========
  return {
    // 状态
    token,
    user,
    // 计算属性
    isLoggedIn,
    // 方法
    login,
    fetchProfile,
    logout,
    updateUserField,
  };
});
