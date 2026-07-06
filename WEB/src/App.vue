<!-- ==================== 根组件 ==================== -->
<!-- 职责：Vue 应用的根组件，根据登录状态切换登录页和主页 -->
<!-- 未登录：显示 LoginPage 登录注册页面 -->
<!-- 已登录：显示 HomePage 首页 -->

<template>
  <!-- 未登录状态：显示登录/注册页面 -->
  <LoginPage v-if="!authStore.isLoggedIn" />

  <!-- 已登录状态：显示首页 -->
  <HomePage v-else />
</template>

<script setup>
// ==================== App.vue 逻辑 ====================

import { useAuthStore } from "./stores/auth"; // 认证状态管理
import LoginPage from "./pages/login/index.vue"; // 登录/注册页面组件
import HomePage from "./pages/home/index.vue"; // 首页组件

// 日志前缀
const TAG = "[App]";

// ========== 认证 Store ==========
const authStore = useAuthStore();

console.log(
  TAG +
    " Vue 3 应用已挂载，登录状态: " +
    (authStore.isLoggedIn ? "已登录" : "未登录")
);
</script>
