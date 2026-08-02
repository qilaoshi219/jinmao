<!-- ==================== 根组件 ==================== -->
<!-- 职责：Vue 应用的根组件，根据登录状态和当前页切换 -->
<!-- 未登录：显示 LoginPage -->
<!-- 支持桌面端和手机端 (/mobile) 两种入口 -->

<template>
  <!-- 未登录状态：显示登录/注册页面 -->
  <LoginPage v-if="!authStore.isLoggedIn" />

  <!-- ===== 桌面端页面 ===== -->
  <!-- 已登录 + 首页 -->
  <HomePage v-else-if="currentPage === 'home'" />

  <!-- 已登录 + 课程学习页 -->
  <StudyPage v-else-if="currentPage === 'study'" />

  <!-- 已登录 + 刷题页（含报告子页）-->
  <QuizPage v-else-if="currentPage === 'quiz'" />

  <!-- 已登录 + 账单页 -->
  <BillingPage v-else-if="currentPage === 'billing'" />

  <!-- 已登录 + 题库详情页 -->
  <QuizDetailPage v-else-if="currentPage === 'quiz-detail'" />

  <!-- 已登录 + 个人设置页 -->
  <ProfilePage v-else-if="currentPage === 'profile'" />

  <!-- 已登录 + 兑换码领取页 -->
  <RedeemPage v-else-if="currentPage === 'redeem'" />

  <!-- 已登录 + 文本粘贴导入题库页 -->
  <QuizImportPage v-else-if="currentPage === 'quiz-import'" />

  <!-- ===== 手机端页面 ===== -->
  <!-- 已登录 + 手机端首页 -->
  <MobileHomePage v-else-if="currentPage === 'mobile-home'" />

  <!-- 已登录 + 手机端个人中心 -->
  <MobileProfilePage v-else-if="currentPage === 'mobile-profile'" />

  <!-- ========== 前端版本号 ========== -->
  <div class="fixed bottom-2 right-3 z-50 text-[11px] text-[var(--color-text-secondary)] select-none pointer-events-none transition-colors duration-500">
    v{{ appVersion }}
  </div>
</template>

<script setup>
import { ref, watch, provide, onMounted, onUnmounted } from "vue";
import { useAuthStore } from "./stores/auth";
import LoginPage from "./pages/login/index.vue";
import HomePage from "./pages/home/index.vue";
import StudyPage from "./pages/study/index.vue";
import QuizPage from "./pages/quiz/index.vue";
import BillingPage from "./pages/billing/index.vue"; // 账单页面
import QuizDetailPage from "./pages/quiz-detail/index.vue"; // 题库详情页面
import ProfilePage from "./pages/profile/index.vue"; // 个人设置页面
import RedeemPage from "./pages/redeem/index.vue"; // 兑换码领取页面
import QuizImportPage from "./pages/quiz-import/index.vue"; // 文本粘贴导入题库页面
import MobileHomePage from "./pages/mobile-home/index.vue"; // 手机端首页
import MobileProfilePage from "./pages/mobile-profile/index.vue"; // 手机端个人中心
import pkg from "../package.json";

const TAG = "[App]";
const appVersion = pkg.version;

const authStore = useAuthStore();

// ==================== URL 路径 → 页面状态映射表 ====================
// 根据 window.location.pathname 确定初始页面，支持从 URL 直达手机端
const PATH_TO_PAGE = {
  "/mobile": "mobile-home",
  "/mobile/profile": "mobile-profile",
};

/**
 * 根据当前 pathname 解析初始页面状态
 * @returns {string} 页面标识
 */
function resolveInitialPage() {
  const pathname = window.location.pathname;
  console.log(TAG + " URL pathname: " + pathname);

  // 优先检查 mobile 路径映射
  if (PATH_TO_PAGE[pathname]) {
    console.log(TAG + " 匹配到移动端路径: " + pathname + " -> " + PATH_TO_PAGE[pathname]);
    return PATH_TO_PAGE[pathname];
  }

  // 默认桌面首页
  return "home";
}

/** 当前页面路由状态 */
const currentPage = ref(resolveInitialPage());

/** 学习页参数（课程 ID 等），由首页传递，学习页接收 */
const studyParams = ref(null);

/** 刷题页参数（sessionId/reportId/mode），由首页或刷题页传递 */
const quizParams = ref(null);

/** 题库详情页参数（textbookId），由首页题库卡片传递 */
const quizDetailParams = ref(null);

// ==================== 手机端 URL 同步映射 ====================
// 手机端页面切换时需要同步浏览器地址栏，以支持书签和刷新
const PAGE_TO_PATH = {
  "mobile-home": "/mobile",
  "mobile-profile": "/mobile/profile",
};

/**
 * 提供 navigate 方法给子组件（通过 provide/inject 或事件）
 * 子组件调用 changePage('study', { courseId: 1 }) 或 changePage('mobile-home') 来切换页面
 * @param {string} page - 目标页面标识
 * @param {Object|null} params - 可选参数
 */
function changePage(page, params = null) {
  console.log(TAG + " 导航到: " + page + (params ? "，参数: " + JSON.stringify(params) : ""));
  currentPage.value = page;

  if (page === "study") {
    studyParams.value = params; // 传递参数给学习页
  } else if (page === "quiz") {
    quizParams.value = params; // 传递参数给刷题页
  } else if (page === "quiz-detail") {
    quizDetailParams.value = params; // 传递参数给题库详情页
  } else if (page === "billing") {
    // 账单页无需参数
  } else if (page === "profile") {
    // 个人设置页无需参数
  } else if (page === "redeem") {
    // 兑换码领取页无需参数
  } else if (page === "quiz-import") {
    // 文本导入页无需参数
  } else {
    // 非参数页面：清空所有参数
    studyParams.value = null;
    quizParams.value = null;
    quizDetailParams.value = null;
  }

  // ===== 手机端页面：同步浏览器 URL（使用 pushState，不回退时触发 popstate） =====
  if (PAGE_TO_PATH[page]) {
    const targetPath = PAGE_TO_PATH[page];
    if (window.location.pathname !== targetPath) {
      console.log(TAG + " 同步 URL: " + targetPath);
      window.history.pushState({ page, params }, "", targetPath);
    }
  }
}

/**
 * 浏览器前进/后退按钮监听
 * 手机端页面间切换时，通过 popstate 同步 currentPage 状态
 */
function onPopState(event) {
  // 仅处理有 state 的 pop 事件（由 pushState 写入）
  const state = event.state;
  if (state && state.page) {
    console.log(TAG + " popstate 回退到: " + state.page);
    currentPage.value = state.page;
    if (state.page === "study") {
      studyParams.value = state.params;
    } else if (state.page === "quiz") {
      quizParams.value = state.params;
    } else if (state.page === "quiz-detail") {
      quizDetailParams.value = state.params;
    }
  }
}

// 提供导航方法给所有子组件
provide("navigate", changePage);
// 提供学习页参数给 StudyPage 组件
provide("studyParams", studyParams);
// 提供刷题页参数给 QuizPage 组件（含报告页）
provide("quizParams", quizParams);
// 提供题库详情页参数给 QuizDetailPage 组件
provide("quizDetailParams", quizDetailParams);

// 退出登录时重置到首页（根据当前 URL 决定是移动首页还是桌面首页）
watch(
  () => authStore.isLoggedIn,
  (val) => {
    if (!val) {
      currentPage.value = "home";
    }
  }
);

// ==================== 生命周期 ====================
onMounted(() => {
  // 注册 popstate 监听，支持移动端页面间浏览器返回键切换
  window.addEventListener("popstate", onPopState);
  console.log(TAG + " popstate 监听已注册");
});

onUnmounted(() => {
  // 组件卸载时移除 popstate 监听
  window.removeEventListener("popstate", onPopState);
  console.log(TAG + " popstate 监听已移除");
});

console.log(
  TAG +
    " Vue 3 应用已挂载 v" +
    appVersion +
    "，登录状态: " +
    (authStore.isLoggedIn ? "已登录" : "未登录") +
    "，当前页: " +
    currentPage.value
);
</script>
