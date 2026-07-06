<!-- ==================== 根组件 ==================== -->
<!-- 职责：Vue 应用的根组件，根据登录状态切换登录页和主页 -->
<!-- 未登录：显示 LoginPage 登录注册页面 -->
<!-- 已登录：显示主页内容 -->

<template>
  <!-- 未登录状态：显示登录/注册页面 -->
  <LoginPage v-if="!authStore.isLoggedIn" />

  <!-- 已登录状态：显示主页内容 -->
  <div v-else class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center transition-colors duration-300">
    <!-- 主题切换按钮（演示用，固定于右上角） -->
    <button
      @click="toggleTheme()"
      class="fixed top-4 right-4 p-2.5 rounded-full bg-white dark:bg-gray-800 shadow-md dark:shadow-gray-900/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 z-50"
      :title="isDark ? '切换到亮色模式' : '切换到暗黑模式'"
    >
      <!-- 暗黑模式下显示太阳图标 -->
      <svg v-if="isDark" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
      </svg>
      <!-- 亮色模式下显示月亮图标 -->
      <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
      </svg>
    </button>

    <!-- 主容器 -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg dark:shadow-gray-900/30 p-8 max-w-md w-full mx-4 transition-colors duration-300">
      <!-- 标题 -->
      <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2 text-center">
        金茂教材处理系统
      </h1>
      <p class="text-gray-500 dark:text-gray-400 text-center mb-6 text-sm">
        JinMao Course Pipeline
      </p>

      <!-- 状态卡片 -->
      <div class="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 rounded-lg p-4 transition-colors duration-300">
        <div class="flex items-center gap-2 mb-2">
          <!-- 绿色圆点指示器 -->
          <span class="w-2.5 h-2.5 bg-green-500 rounded-full inline-block"></span>
          <span class="text-green-700 dark:text-green-400 font-medium text-sm">前端基础设施运行正常</span>
        </div>
        <p class="text-green-600 dark:text-green-400 text-xs leading-relaxed">
          Vue 3 + Vite + Tailwind CSS + Pinia + Axios 已就绪
        </p>
      </div>

      <!-- 用户信息卡片（登录后显示） -->
      <div class="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 mt-4 transition-colors duration-300">
        <p class="text-blue-700 dark:text-blue-400 font-medium text-sm mb-1">
          已登录
        </p>
        <p class="text-blue-600 dark:text-blue-400 text-xs leading-relaxed">
          用户ID: {{ authStore.user?.id }}
          <span v-if="authStore.user?.isNewUser" class="ml-1 text-green-600 dark:text-green-400">（新注册用户）</span>
        </p>
      </div>

      <!-- 技术栈标签 -->
      <div class="flex flex-wrap gap-2 mt-5 justify-center">
        <span class="px-3 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
          Vue 3
        </span>
        <span class="px-3 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
          Vite
        </span>
        <span class="px-3 py-1 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 rounded-full text-xs font-medium">
          Tailwind CSS
        </span>
        <span class="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded-full text-xs font-medium">
          Pinia
        </span>
        <span class="px-3 py-1 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 rounded-full text-xs font-medium">
          Axios
        </span>
      </div>

      <!-- 登出按钮 -->
      <div class="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
        <button
          class="w-full py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
          @click="handleLogout"
        >
          退出登录
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// ==================== App.vue 逻辑 ====================

import { useAuthStore } from "./stores/auth"; // 认证状态管理
import LoginPage from "./pages/login/index.vue"; // 登录/注册页面组件（pages/login/ 文件夹）
import { useTheme } from "./composables/useTheme"; // 暗黑模式主题切换

// 日志前缀
const TAG = "[App]";

// ========== 认证 Store ==========
const authStore = useAuthStore();

// ========== 主题切换 ==========
// 使用 VueUse 的 useDark（成熟方案，非自研）管理暗黑模式状态
const { isDark, toggleTheme } = useTheme();

// ========== 方法 ==========

/**
 * 退出登录
 * 调用 Store 的 logout 方法清除 token 和用户信息
 * isLoggedIn 变为 false 后自动切换回登录页
 */
function handleLogout() {
  console.log(TAG + " 用户点击退出登录");
  authStore.logout();
}

console.log(
  TAG +
    " Vue 3 应用已挂载，登录状态: " +
    (authStore.isLoggedIn ? "已登录" : "未登录")
);
</script>
