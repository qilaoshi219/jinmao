<!-- ==================== 根组件 ==================== -->
<!-- 职责：Vue 应用的根组件，根据登录状态和当前页切换 -->
<!-- 未登录：显示 LoginPage -->
<!-- 已登录 + home：显示 HomePage -->
<!-- 已登录 + study：显示 StudyPage -->

<template>
  <!-- 未登录状态：显示登录/注册页面 -->
  <LoginPage v-if="!authStore.isLoggedIn" />

  <!-- 已登录 + 首页 -->
  <HomePage v-else-if="currentPage === 'home'" />

  <!-- 已登录 + 课程学习页 -->
  <StudyPage v-else-if="currentPage === 'study'" />

  <!-- 已登录 + 刷题页（含报告子页）-->
  <QuizPage v-else-if="currentPage === 'quiz'" />

  <!-- ========== 前端版本号 ========== -->
  <div class="fixed bottom-2 right-3 z-50 text-[11px] text-[var(--color-text-secondary)] select-none pointer-events-none transition-colors duration-500">
    v{{ appVersion }}
  </div>
</template>

<script setup>
import { ref, watch, provide } from "vue";
import { useAuthStore } from "./stores/auth";
import LoginPage from "./pages/login/index.vue";
import HomePage from "./pages/home/index.vue";
import StudyPage from "./pages/study/index.vue";
import QuizPage from "./pages/quiz/index.vue";
import pkg from "../package.json";

const TAG = "[App]";
const appVersion = pkg.version;

const authStore = useAuthStore();

/** 当前页面路由状态 ('home' | 'study') */
const currentPage = ref("home");

/** 学习页参数（课程 ID 等），由首页传递，学习页接收 */
const studyParams = ref(null);

/** 刷题页参数（sessionId/reportId/mode），由首页或刷题页传递 */
const quizParams = ref(null);

/**
 * 提供 navigate 方法给子组件（通过 provide/inject 或事件）
 * 子组件调用 changePage('study', { courseId: 1 }) 或 changePage('home') 来切换页面
 * @param {string} page - 目标页面标识 ('home' | 'study')
 * @param {Object|null} params - 可选参数（如 { courseId }），仅 study 页使用
 */
function changePage(page, params = null) {
  console.log(TAG + " 导航到: " + page + (params ? "，参数: " + JSON.stringify(params) : ""));
  currentPage.value = page;
  if (page === "study") {
    studyParams.value = params; // 传递参数给学习页
  } else if (page === "quiz") {
    quizParams.value = params; // 传递参数给刷题页
  } else {
    studyParams.value = null;
    quizParams.value = null; // 返回首页时清空参数
  }
}

// 提供导航方法给所有子组件
provide("navigate", changePage);
// 提供学习页参数给 StudyPage 组件
provide("studyParams", studyParams);
// 提供刷题页参数给 QuizPage 组件（含报告页）
provide("quizParams", quizParams);

// 退出登录时重置到首页
watch(
  () => authStore.isLoggedIn,
  (val) => {
    if (!val) {
      currentPage.value = "home";
    }
  }
);

console.log(
  TAG +
    " Vue 3 应用已挂载 v" +
    appVersion +
    "，登录状态: " +
    (authStore.isLoggedIn ? "已登录" : "未登录")
);
</script>
