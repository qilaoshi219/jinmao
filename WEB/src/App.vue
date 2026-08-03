<!-- ==================== 根组件 ==================== -->
<!-- 职责：Vue 应用的根组件，根据登录状态和当前页切换 -->
<!-- 未登录：显示 LoginPage -->
<!-- 支持桌面端和手机端 (/mobile) 两种入口 -->

<template>
  <!-- ===== 公开考试页（免登录，独立于登录拦截）===== -->
  <PublicExamPage v-if="currentPage === 'public-exam'" />

  <!-- 未登录状态：显示登录/注册页面 -->
  <LoginPage v-else-if="!authStore.isLoggedIn" />

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

  <!-- 已登录 + PDF 分割器页 -->
  <PdfSplitterPage v-else-if="currentPage === 'tools-pdf-splitter'" />

  <!-- ===== 手机端页面 ===== -->
  <!-- 已登录 + 手机端首页 -->
  <MobileHomePage v-else-if="currentPage === 'mobile-home'" />

  <!-- 已登录 + 手机端个人中心 -->
  <MobileProfilePage v-else-if="currentPage === 'mobile-profile'" />

  <!-- 已登录 + 公开考试数据页（所有者） -->
  <PublicStatsPage v-else-if="currentPage === 'public-stats'" />

  <!-- 已登录 + 选择考试页（我的公开考试列表） -->
  <PublicExamsListPage v-else-if="currentPage === 'public-exams-list'" />

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
import PdfSplitterPage from "./pages/tools/pdf-splitter/index.vue"; // PDF 分割器页面
import MobileHomePage from "./pages/mobile-home/index.vue"; // 手机端首页
import MobileProfilePage from "./pages/mobile-profile/index.vue"; // 手机端个人中心
import PublicExamPage from "./pages/public-exam/index.vue"; // 公开考试页（二维码考试，免登录）
import PublicStatsPage from "./pages/public-stats/index.vue"; // 公开考试数据页（所有者）
import PublicExamsListPage from "./pages/public-exams-list/index.vue"; // 选择考试页（我的公开考试列表）
import pkg from "../package.json";

const TAG = "[App]";
const appVersion = pkg.version;

const authStore = useAuthStore();

// ==================== URL 路径 → 页面状态映射表 ====================
// 所有页面（桌面端 + 手机端）都拥有真实 URL 路径，支持浏览器返回/前进、刷新与直达深链
const PATH_TO_PAGE = {
  "/": "home",
  "/study": "study",
  "/quiz": "quiz",
  "/quiz/report": "quiz", // 刷题报告子视图（params.mode === "report"）
  "/billing": "billing",
  "/quiz-detail": "quiz-detail",
  "/profile": "profile",
  "/redeem": "redeem",
  "/quiz-import": "quiz-import",
  "/tools/pdf-splitter": "tools-pdf-splitter",
  "/mobile": "mobile-home",
  "/mobile/profile": "mobile-profile",
  "/quiz/public-stats": "public-stats",
  "/quiz/public-exams": "public-exams-list",
};

// 页面状态 → URL 基础路径
const PAGE_TO_PATH = {
  home: "/",
  study: "/study",
  quiz: "/quiz",
  billing: "/billing",
  "quiz-detail": "/quiz-detail",
  profile: "/profile",
  redeem: "/redeem",
  "quiz-import": "/quiz-import",
  "tools-pdf-splitter": "/tools/pdf-splitter",
  "mobile-home": "/mobile",
  "mobile-profile": "/mobile/profile",
  "public-stats": "/quiz/public-stats",
  "public-exams-list": "/quiz/public-exams",
};

/**
 * 从当前 URL（pathname + search）解析页面状态
 * @returns {{ page: string, params: object|null }}
 */
function parseLocation() {
  const pathname = window.location.pathname;
  const search = window.location.search;
  console.log(TAG + " URL pathname: " + pathname + search);

  const query = new URLSearchParams(search);
  const params = {};

  // 公开考试页：/p/:token（免登录直达）
  let page = PATH_TO_PAGE[pathname] || "home";
  if (pathname.startsWith("/p/")) {
    page = "public-exam";
    const segments = pathname.split("/").filter(Boolean);
    if (segments[1]) params.token = decodeURIComponent(segments[1]);
  } else if (page === "study") {
    const courseId = query.get("courseId");
    if (courseId) params.courseId = courseId;
  } else if (page === "quiz") {
    if (pathname === "/quiz/report") {
      const reportId = query.get("reportId");
      if (reportId) {
        params.mode = "report";
        params.reportId = reportId;
      }
    } else {
      const sessionId = query.get("sessionId");
      if (sessionId) params.sessionId = sessionId;
      const mode = query.get("mode");
      if (mode) params.sessionMode = mode;
    }
  } else if (page === "quiz-detail") {
    const textbookId = query.get("textbookId");
    if (textbookId) params.textbookId = textbookId;
  } else if (page === "public-stats") {
    const token = query.get("token");
    if (token) params.token = token;
  }

  return { page, params: Object.keys(params).length ? params : null };
}

/**
 * 根据页面状态生成 URL（含 query 参数）
 * @param {string} page - 页面标识
 * @param {object|null} params - 页面参数
 * @returns {string} 完整路径
 */
function buildPath(page, params = null) {
  // 刷题报告子视图使用嵌套路径 /quiz/report
  if (page === "quiz" && params?.mode === "report") {
    const reportQuery = new URLSearchParams();
    if (params.reportId) reportQuery.set("reportId", params.reportId);
    const reportQs = reportQuery.toString();
    return "/quiz/report" + (reportQs ? "?" + reportQs : "");
  }

  const query = new URLSearchParams();
  if (page === "public-exam" && params?.token) {
    return "/p/" + encodeURIComponent(params.token);
  } else if (page === "study" && params?.courseId) {
    query.set("courseId", params.courseId);
  } else if (page === "quiz") {
    if (params?.sessionId) query.set("sessionId", params.sessionId);
    if (params?.sessionMode) query.set("mode", params.sessionMode);
  } else if (page === "quiz-detail" && params?.textbookId) {
    query.set("textbookId", params.textbookId);
  } else if (page === "public-stats" && params?.token) {
    query.set("token", params.token);
  }

  const base = PAGE_TO_PATH[page] || "/";
  const qs = query.toString();
  return qs ? base + "?" + qs : base;
}

/** 当前页面路由状态 */
const currentPage = ref("home");

/** 学习页参数（课程 ID 等），由首页传递，学习页接收 */
const studyParams = ref(null);

/** 刷题页参数（sessionId/reportId/mode），由首页或刷题页传递 */
const quizParams = ref(null);

/** 题库详情页参数（textbookId），由首页题库卡片传递 */
const quizDetailParams = ref(null);

/** 公开考试数据页参数（token），由发布弹窗/三点菜单传递 */
const publicStatsParams = ref(null);

// ==================== 应用内历史镜像 ====================
// 记录由本应用写入浏览器历史的状态条目，用于判断页面内"返回"按钮
// 能否回退到上一个应用内页面（镜像索引为 0 时表示没有可回退的应用内历史）
const appHistory = [];
let appIndex = -1;

/**
 * 应用页面状态：切换 currentPage 并写入对应参数 ref
 * @param {string} page - 页面标识
 * @param {object|null} params - 页面参数
 */
function applyPageState(page, params) {
  currentPage.value = page;

  if (page === "study") {
    studyParams.value = params; // 传递参数给学习页
  } else if (page === "quiz") {
    quizParams.value = params; // 传递参数给刷题页
  } else if (page === "quiz-detail") {
    quizDetailParams.value = params; // 传递参数给题库详情页
  } else if (page === "public-stats") {
    publicStatsParams.value = params; // 传递参数给公开考试数据页
  } else if (
    page === "billing" ||
    page === "profile" ||
    page === "redeem" ||
    page === "quiz-import" ||
    page === "tools-pdf-splitter"
  ) {
    // 无需参数
  } else {
    // 非参数页面：清空所有参数
    studyParams.value = null;
    quizParams.value = null;
    quizDetailParams.value = null;
    publicStatsParams.value = null;
  }
}

/**
 * 提供 navigate 方法给子组件（通过 provide/inject 或事件）
 * 子组件调用 changePage('study', { courseId: 1 }) 或 changePage('mobile-home') 来切换页面
 * @param {string} page - 目标页面标识
 * @param {object|null} params - 可选参数
 * @param {{ replace?: boolean }} [options] - 可选；replace=true 时用 replaceState 替换当前历史条目（页面内子视图跳转）
 */
function changePage(page, params = null, options = {}) {
  const replace = !!options?.replace;
  console.log(
    TAG + " 导航到: " + page + (params ? "，参数: " + JSON.stringify(params) : "") + (replace ? "（replaceState）" : "")
  );

  applyPageState(page, params);

  // 同步浏览器 URL 与历史记录：页面级跳转 pushState，子视图跳转 replaceState
  const url = buildPath(page, params);
  const state = { page, params };
  if (replace) {
    window.history.replaceState(state, "", url);
    if (appIndex >= 0) {
      appHistory[appIndex] = state;
    } else {
      appHistory.push(state);
      appIndex = appHistory.length - 1;
    }
  } else {
    window.history.pushState(state, "", url);
    appHistory.push(state);
    appIndex = appHistory.length - 1;
  }
}

/**
 * 判断两个历史状态条目是否等价（用于 popstate 时定位镜像索引）
 */
function sameState(a, b) {
  if (a.page !== b.page) return false;
  return JSON.stringify(a.params || null) === JSON.stringify(b.params || null);
}

/**
 * 浏览器前进/后退按钮监听
 * 通过 popstate 将 currentPage 与参数恢复到历史条目对应的页面
 */
function onPopState(event) {
  const state = event.state;
  if (state && state.page) {
    // 落在由本应用 pushState 写入的条目 → 直接恢复
    console.log(TAG + " popstate 恢复页面: " + state.page);
    applyPageState(state.page, state.params);
    const idx = appHistory.findIndex((e) => sameState(e, state));
    appIndex = idx >= 0 ? idx : 0;
  } else {
    // 初始加载条目（state 为 null）→ 从当前 URL 重新解析
    const loc = parseLocation();
    console.log(TAG + " popstate 回到初始条目: " + loc.page);
    applyPageState(loc.page, loc.params);
    appIndex = 0;
  }
}

/**
 * 页面内"返回"按钮：优先回退到上一个应用内页面，无应用内历史时兜底返回首页
 */
function goBack() {
  console.log(TAG + " 返回按钮触发，应用内历史索引: " + appIndex);
  if (appIndex > 0) {
    window.history.back();
  } else {
    console.log(TAG + " 无应用内历史，返回首页");
    changePage("home");
  }
}

// ==================== 初始化 ====================
// 解析当前 URL 确定初始页面与参数（支持刷新与直达深链；
// 未登录时由模板最外层的 LoginPage 拦截，登录成功后即落在直达页面）
const initialLocation = parseLocation();
applyPageState(initialLocation.page, initialLocation.params);
appHistory.push({ page: initialLocation.page, params: initialLocation.params });
appIndex = 0;

// 提供导航方法给所有子组件
provide("navigate", changePage);
// 提供"返回上一页"方法给所有子组件（页面内返回按钮使用）
provide("goBack", goBack);
// 提供学习页参数给 StudyPage 组件
provide("studyParams", studyParams);
// 提供刷题页参数给 QuizPage 组件（含报告页）
provide("quizParams", quizParams);
// 提供题库详情页参数给 QuizDetailPage 组件
provide("quizDetailParams", quizDetailParams);
// 提供公开考试数据页参数给 PublicStatsPage 组件
provide("publicStatsParams", publicStatsParams);

// 退出登录时重置到首页，并同步浏览器 URL（replaceState，不新增历史条目）
watch(
  () => authStore.isLoggedIn,
  (val) => {
    if (!val) {
      currentPage.value = "home";
      window.history.replaceState({ page: "home", params: null }, "", buildPath("home"));
      if (appIndex >= 0) {
        appHistory[appIndex] = { page: "home", params: null };
      }
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
