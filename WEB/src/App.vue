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

  <!-- 已登录 + 手机端刷题页（含报告子页） -->
  <MobileQuizPage v-else-if="currentPage === 'mobile-quiz'" />

  <!-- 已登录 + 手机端题库详情页 -->
  <MobileQuizDetailPage v-else-if="currentPage === 'mobile-quiz-detail'" />

  <!-- 已登录 + 手机端账单页 -->
  <MobileBillingPage v-else-if="currentPage === 'mobile-billing'" />

  <!-- 已登录 + 手机端兑换码页 -->
  <MobileRedeemPage v-else-if="currentPage === 'mobile-redeem'" />

  <!-- 已登录 + 手机端个人设置页 -->
  <MobileSettingsPage v-else-if="currentPage === 'mobile-settings'" />

  <!-- 已登录 + 手机端题库市场页 -->
  <MobileMarketPage v-else-if="currentPage === 'mobile-market'" />

  <!-- 已登录 + 手机端小工具列表页 -->
  <MobileToolsPage v-else-if="currentPage === 'mobile-tools'" />

  <!-- 已登录 + 手机端 PDF 分割器页 -->
  <MobilePdfSplitterPage v-else-if="currentPage === 'mobile-tools-pdf-splitter'" />

  <!-- 已登录 + 手机端公开考试数据页（所有者） -->
  <MobilePublicStatsPage v-else-if="currentPage === 'mobile-public-stats'" />

  <!-- 已登录 + 手机端公开考试列表页 -->
  <MobilePublicExamsListPage v-else-if="currentPage === 'mobile-public-exams-list'" />

  <!-- 已登录 + 公开考试数据页（所有者） -->
  <PublicStatsPage v-else-if="currentPage === 'public-stats'" />

  <!-- 已登录 + 选择考试页（我的公开考试列表） -->
  <PublicExamsListPage v-else-if="currentPage === 'public-exams-list'" />

  <!-- 手机端跳转提示全屏弹窗（仅手机用户进入电脑端页面时出现） -->
  <MobileRedirectDialog
    :visible="showMobileRedirect"
    @confirm="handleMobileRedirectConfirm"
    @cancel="handleMobileRedirectCancel"
  />

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
import MobileQuizPage from "./pages/mobile-quiz/index.vue"; // 手机端刷题页
import MobileQuizDetailPage from "./pages/mobile-quiz-detail/index.vue"; // 手机端题库详情页
import MobileBillingPage from "./pages/mobile-billing/index.vue"; // 手机端账单页
import MobileRedeemPage from "./pages/mobile-redeem/index.vue"; // 手机端兑换码页
import MobileSettingsPage from "./pages/mobile-settings/index.vue"; // 手机端个人设置页
import MobileMarketPage from "./pages/mobile-market/index.vue"; // 手机端题库市场页
import MobileToolsPage from "./pages/mobile-tools/index.vue"; // 手机端小工具列表页
import MobilePdfSplitterPage from "./pages/mobile-tools/pdf-splitter/index.vue"; // 手机端 PDF 分割器页
import MobilePublicStatsPage from "./pages/mobile-public-stats/index.vue"; // 手机端公开考试数据页
import MobilePublicExamsListPage from "./pages/mobile-public-exams-list/index.vue"; // 手机端公开考试列表页
import PublicExamPage from "./pages/public-exam/index.vue"; // 公开考试页（二维码考试，免登录）
import PublicStatsPage from "./pages/public-stats/index.vue"; // 公开考试数据页（所有者）
import PublicExamsListPage from "./pages/public-exams-list/index.vue"; // 选择考试页（我的公开考试列表）
import MobileRedirectDialog from "./components/MobileRedirectDialog.vue"; // 手机端跳转提示弹窗
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
  "/mobile/quiz": "mobile-quiz",
  "/mobile/quiz/report": "mobile-quiz",
  "/mobile/quiz-detail": "mobile-quiz-detail",
  "/mobile/billing": "mobile-billing",
  "/mobile/redeem": "mobile-redeem",
  "/mobile/settings": "mobile-settings",
  "/mobile/market": "mobile-market",
  "/mobile/tools": "mobile-tools",
  "/mobile/tools/pdf-splitter": "mobile-tools-pdf-splitter",
  "/mobile/public-stats": "mobile-public-stats",
  "/mobile/public-exams": "mobile-public-exams-list",
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
  "mobile-quiz": "/mobile/quiz",
  "mobile-quiz-detail": "/mobile/quiz-detail",
  "mobile-billing": "/mobile/billing",
  "mobile-redeem": "/mobile/redeem",
  "mobile-settings": "/mobile/settings",
  "mobile-market": "/mobile/market",
  "mobile-tools": "/mobile/tools",
  "mobile-tools-pdf-splitter": "/mobile/tools/pdf-splitter",
  "mobile-public-stats": "/mobile/public-stats",
  "mobile-public-exams-list": "/mobile/public-exams",
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
  } else if (page === "mobile-quiz") {
    if (pathname === "/mobile/quiz/report") {
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
  } else if (page === "mobile-quiz-detail") {
    const textbookId = query.get("textbookId");
    if (textbookId) params.textbookId = textbookId;
  } else if (page === "public-stats") {
    const token = query.get("token");
    if (token) params.token = token;
  } else if (page === "mobile-public-stats") {
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

  // 手机端刷题报告子视图使用嵌套路径 /mobile/quiz/report
  if (page === "mobile-quiz" && params?.mode === "report") {
    const reportQuery = new URLSearchParams();
    if (params.reportId) reportQuery.set("reportId", params.reportId);
    const reportQs = reportQuery.toString();
    return "/mobile/quiz/report" + (reportQs ? "?" + reportQs : "");
  }

  const query = new URLSearchParams();
  if (page === "public-exam" && params?.token) {
    return "/p/" + encodeURIComponent(params.token);
  } else if (page === "study" && params?.courseId) {
    query.set("courseId", params.courseId);
  } else if (page === "quiz") {
    if (params?.sessionId) query.set("sessionId", params.sessionId);
    if (params?.sessionMode) query.set("mode", params.sessionMode);
  } else if (page === "mobile-quiz") {
    if (params?.sessionId) query.set("sessionId", params.sessionId);
    if (params?.sessionMode) query.set("mode", params.sessionMode);
  } else if (page === "quiz-detail" && params?.textbookId) {
    query.set("textbookId", params.textbookId);
  } else if (page === "mobile-quiz-detail" && params?.textbookId) {
    query.set("textbookId", params.textbookId);
  } else if (page === "public-stats" && params?.token) {
    query.set("token", params.token);
  } else if (page === "mobile-public-stats" && params?.token) {
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
  } else if (page === "mobile-quiz") {
    quizParams.value = params; // 手机端刷题页复用同一参数通道
  } else if (page === "mobile-quiz-detail") {
    quizDetailParams.value = params; // 手机端题库详情页复用同一参数通道
  } else if (page === "mobile-public-stats") {
    publicStatsParams.value = params; // 手机端公开考试数据页复用同一参数通道
  } else if (
    page === "billing" ||
    page === "profile" ||
    page === "redeem" ||
    page === "quiz-import" ||
    page === "tools-pdf-splitter" ||
    page === "mobile-billing" ||
    page === "mobile-redeem" ||
    page === "mobile-settings" ||
    page === "mobile-market" ||
    page === "mobile-tools" ||
    page === "mobile-tools-pdf-splitter" ||
    page === "mobile-public-exams-list"
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

// ==================== 移动端设备检测与跳转提示 ====================
// 当手机用户进入电脑端页面时，弹出全屏提示询问是否跳转到手机版。
// 每会话只询问一次（sessionStorage 记忆），"是"保留 query 参数跳转。

/** 移动端跳转提示的记忆键（会话级） */
const MOBILE_REDIRECT_KEY = "mobile_redirect_asked";

/** 是否为手机设备（移动端 UA 或窄屏） */
const isMobileDevice = ref(
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") ||
  window.innerWidth < 768
);

/** 跳转提示弹窗可见性 */
const showMobileRedirect = ref(false);

/** 桌面页 → 移动页映射（仅映射有手机版对应页的页面） */
const DESKTOP_TO_MOBILE = {
  home: "mobile-home",
  quiz: "mobile-quiz",
  "quiz-detail": "mobile-quiz-detail",
  billing: "mobile-billing",
  profile: "mobile-settings",
  redeem: "mobile-redeem",
  "tools-pdf-splitter": "mobile-tools-pdf-splitter",
  "public-stats": "mobile-public-stats",
  "public-exams-list": "mobile-public-exams-list",
};

/** 取当前桌面页对应的路由参数（供跳转时保留 query） */
function currentParamsOf(page) {
  if (page === "quiz") return quizParams.value;
  if (page === "quiz-detail") return quizDetailParams.value;
  if (page === "public-stats") return publicStatsParams.value;
  return null;
}

/** 进入有手机版对应页的桌面页时，检查是否需要弹出跳转提示 */
function maybeShowMobileRedirect() {
  if (!isMobileDevice.value) return;
  if (showMobileRedirect.value) return;
  if (sessionStorage.getItem(MOBILE_REDIRECT_KEY)) return;
  if (!DESKTOP_TO_MOBILE[currentPage.value]) return;
  showMobileRedirect.value = true;
}

/** 用户选择"是，前往手机版" */
function handleMobileRedirectConfirm() {
  sessionStorage.setItem(MOBILE_REDIRECT_KEY, "1");
  showMobileRedirect.value = false;
  const target = DESKTOP_TO_MOBILE[currentPage.value];
  if (target) {
    changePage(target, currentParamsOf(currentPage.value));
  }
}

/** 用户选择"否，留在电脑版" */
function handleMobileRedirectCancel() {
  sessionStorage.setItem(MOBILE_REDIRECT_KEY, "1");
  showMobileRedirect.value = false;
}

// 监听当前页变化：进入桌面页时触发检查，进入手机页时自动关闭弹窗
// immediate：首次加载直接落在桌面页（如 /、/billing）时也要弹出提示
watch(currentPage, () => {
  showMobileRedirect.value = false;
  maybeShowMobileRedirect();
}, { immediate: true });

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
