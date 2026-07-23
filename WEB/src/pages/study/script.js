// ============================================================================
// 文件名：script.js
// 所属组件：pages/study/index.vue（课程学习页面）
// 所属目录：src/pages/study/
// 文件作用：课程学习页的全部业务逻辑模块
//
// 实现功能：
//   1. 主题切换（复用 useTheme）
//   2. 侧边栏折叠/展开
//   3. 侧边栏拖动调整宽度（useResize composable）
//   4. PPT 播放区：播放/暂停、上一页/下一页、自动播放、倍速切换
//   5. B站风格控件 hover 显示/隐藏
//   6. PPT 全屏切换
//   7. 进度条模拟
//   8. AI 助教对话
//   9. AI/口播稿 Tab 切换
//  10. 章节列表导航
//  11. 返回首页（emit 事件）
//
// 数据流：
//   用户交互 → setup() 内方法 → 响应式状态更新 → 视图自动更新
//   goBack → emit('navigate', 'home') → App.vue 切换回首页
//
// 依赖关系：
//   输入依赖：../../composables/useTheme、../../composables/useResize
//   输出给：index.vue 模板（通过 setup() 返回的对象）
//
// 上次修改：2026-07-23（NERV 设计稿合并：新建课程学习页）
// ============================================================================

import { ref, computed, onMounted, onUnmounted, inject } from "vue";
import { useTheme } from "../../composables/useTheme";
import { useResize } from "../../composables/useResize";

// ============================================================================
// 一、常量定义
// ============================================================================

/** 控制台日志前缀 */
const TAG = "[StudyPage]";

/** 每页展示时长（秒），用于模拟进度 */
const PAGE_DURATION = 120;

// ============================================================================
// 二、静态占位数据（后续对接真实 API）
// ============================================================================

/** 章节列表占位数据 */
const DEFAULT_CHAPTERS = [
  { id: 1, title: "函数与极限", duration: "12:08", status: "completed" },
  { id: 2, title: "数列极限", duration: "14:21", status: "completed" },
  { id: 3, title: "函数极限", duration: "15:42", status: "completed" },
  { id: 4, title: "无穷小与无穷大", duration: "10:55", status: "completed" },
  { id: 5, title: "极限运算法则", duration: "18:30", status: "completed" },
  { id: 6, title: "极限存在准则", duration: "13:17", status: "completed" },
  { id: 7, title: "连续与间断", duration: "16:05", status: "completed" },
  { id: 8, title: "导数定义", duration: "15:32", status: "active" },
  { id: 9, title: "求导法则", duration: "20:00", status: "pending" },
  { id: 10, title: "高阶导数", duration: "18:45", status: "pending" },
  { id: 11, title: "隐函数求导", duration: "16:20", status: "pending" },
  { id: 12, title: "微分中值定理", duration: "22:10", status: "pending" },
];

/** AI 初始对话 */
const DEFAULT_AI_MESSAGES = [
  { role: "user", text: "这页的导数定义不太理解" },
  { role: "ai", text: "导数描述的是函数在某一点处的瞬时变化率。你可以想象一辆汽车的行驶——速度表上的读数就是位移对时间的导数。" },
  { role: "user", text: "Δx 趋近于 0 是什么意思？" },
  { role: "ai", text: "Δx 趋近于 0 是指自变量的变化量无限缩小，但永远不等于 0。这正是微积分的核心思想——用无限逼近的方式来研究变化。" },
];

/** 字幕文本 */
const DEFAULT_SUBTITLE = "导数的定义：设函数 y = f(x) 在点 x₀ 的某个邻域内有定义，当自变量 x 在 x₀ 处取得增量 Δx 时，函数取得增量 Δy = f(x₀ + Δx) - f(x₀)；如果 Δy 与 Δx 之比的极限存在，则称函数在点 x₀ 处可导。";

// ============================================================================
// 三、模块默认导出
// ============================================================================

export default {
  /**
   * 使用 inject('navigate') 导航，由 App.vue provide
   */
  setup() {
    // ========================================================================
    // 3.1 导航（从 App.vue 注入）
    // ========================================================================
    const navigate = inject("navigate", (page) => {
      console.warn(TAG + " navigate 未从父组件注入，当前页: " + page);
    });

    // ========================================================================
    // 3.2 主题切换
    // ========================================================================
    const { isDark, toggleTheme } = useTheme();

    // ========================================================================
    // 3.2 侧边栏拖动
    // ========================================================================
    const { startResize } = useResize();

    // ========================================================================
    // 3.3 响应式数据
    // ========================================================================

    // ---- 章节数据 ----
    const chapters = ref(DEFAULT_CHAPTERS);
    const activeChapter = ref(8); // 当前活跃章节

    // ---- 侧边栏 ----
    const sidebarExpanded = ref(true);

    // ---- 播放器状态 ----
    const isPlaying = ref(true);
    const isFullscreen = ref(false);
    const autoPlay = ref(true);
    const playbackSpeed = ref("1.0");
    const currentPage = ref(8);
    const totalPages = ref(45);
    const progressPercent = ref(62);
    const currentTime = ref(8 * 60 + 32); // 秒：08:32
    const totalTime = (15 * 60 + 32); // 秒：15:32

    // ---- 字幕 ----
    const subtitleText = ref(DEFAULT_SUBTITLE);

    // ---- 控件显示 ----
    let hideTimer = null;

    // ---- AI 对话 ----
    const aiMessages = ref([...DEFAULT_AI_MESSAGES]);
    const aiInput = ref("");

    // ---- Tab ----
    const activeTab = ref("ai");

    // ---- DOM 引用 ----
    const pptContainer = ref(null);
    const playerControls = ref(null);

    // ========================================================================
    // 3.4 计算属性
    // ========================================================================

    /** 当前章节标题 */
    const currentChapterTitle = computed(() => {
      const ch = chapters.value.find((c) => c.id === activeChapter.value);
      return ch ? ch.title : "";
    });

    /** 格式化时间 MM:SS */
    const formattedTime = computed(() => {
      const mins = Math.floor(currentTime.value / 60);
      const secs = currentTime.value % 60;
      return String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
    });

    // ========================================================================
    // 3.5 导航
    // ========================================================================

    /** 返回首页 */
    function goBack() {
      console.log(TAG + " 返回首页");
      navigate("home");
    }

    // ========================================================================
    // 3.6 侧边栏
    // ========================================================================

    /** 折叠/展开左侧边栏 */
    function toggleSidebar() {
      sidebarExpanded.value = !sidebarExpanded.value;
      const sidebar = document.getElementById("left-sidebar");
      const nav = document.getElementById("sidebar-nav");
      if (sidebar) {
        sidebar.style.width = sidebarExpanded.value ? "224px" : "40px";
        if (nav) {
          nav.style.display = sidebarExpanded.value ? "" : "none";
        }
      }
    }

    // ========================================================================
    // 3.7 播放器控制
    // ========================================================================

    function togglePlay() {
      isPlaying.value = !isPlaying.value;
      console.log(TAG + (isPlaying.value ? " 播放" : " 暂停"));
    }

    function prevPage() {
      if (currentPage.value > 1) {
        currentPage.value--;
        syncProgressFromPage();
      }
    }

    function nextPage() {
      if (currentPage.value < totalPages.value) {
        currentPage.value++;
        syncProgressFromPage();
      }
    }

    function toggleAutoPlay() {
      autoPlay.value = !autoPlay.value;
      console.log(TAG + " 自动播放: " + autoPlay.value);
    }

    /** 页码变化后同步进度条和时间 */
    function syncProgressFromPage() {
      progressPercent.value = Math.round((currentPage.value / totalPages.value) * 100);
      currentTime.value = (currentPage.value - 1) * PAGE_DURATION + 32;
    }

    /** 点击进度条跳转 */
    function seekProgress(e) {
      const bar = e.currentTarget;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      progressPercent.value = Math.round(pct * 100);
      currentPage.value = Math.max(1, Math.round(pct * totalPages.value));
      currentTime.value = Math.round(pct * totalTime);
    }

    // ========================================================================
    // 3.8 PPT 全屏
    // ========================================================================

    function toggleFullscreen() {
      isFullscreen.value = !isFullscreen.value;
      const container = pptContainer.value;
      const controls = playerControls.value;
      if (!container) { return; }

      if (isFullscreen.value) {
        container.style.position = "fixed";
        container.style.inset = "0";
        container.style.zIndex = "100";
        container.style.width = "100vw";
        container.style.height = "100vh";
        container.style.aspectRatio = "auto";
        if (controls) {
          controls.style.position = "fixed";
          controls.style.zIndex = "101";
          controls.style.width = "100vw";
          controls.style.left = "0";
          controls.style.opacity = "1";
          controls.style.pointerEvents = "auto";
        }
      } else {
        container.style.position = "";
        container.style.inset = "";
        container.style.zIndex = "10";
        container.style.width = "";
        container.style.height = "";
        container.style.aspectRatio = "16/9";
        if (controls) {
          controls.style.position = "";
          controls.style.zIndex = "30";
          controls.style.width = "";
          controls.style.left = "";
          controls.style.opacity = "0";
          controls.style.pointerEvents = "none";
        }
      }
    }

    // ========================================================================
    // 3.9 B站风格控件 hover 显示/隐藏
    // ========================================================================

    function showControls() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      const el = playerControls.value;
      if (el) {
        el.style.opacity = "1";
        el.style.pointerEvents = "auto";
      }
    }

    function hideControls() {
      hideTimer = setTimeout(() => {
        const el = playerControls.value;
        if (el) {
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
        }
      }, 800);
    }

    function cancelHideTimer() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }

    // ========================================================================
    // 3.10 AI 对话
    // ========================================================================

    function sendAiMessage() {
      const msg = aiInput.value.trim();
      if (!msg) { return; }
      aiMessages.value.push({ role: "user", text: msg });
      aiInput.value = "";
      // 模拟 AI 回复（后续对接真实 API）
      setTimeout(() => {
        aiMessages.value.push({
          role: "ai",
          text: "这是一个很好的问题！让我来为你详细解释。（模拟 AI 回复，后续对接真实 API）",
        });
      }, 1000);
      console.log(TAG + " AI 消息发送: " + msg);
    }

    // ========================================================================
    // 3.11 生命周期
    // ========================================================================

    onMounted(() => {
      console.log(TAG + " NERV 三栏播放器学习页初始化完成");
    });

    onUnmounted(() => {
      if (hideTimer) { clearTimeout(hideTimer); }
    });

    // ========================================================================
    // 3.12 返回模板
    // ========================================================================

    return {
      // 主题
      isDark,
      toggleTheme,

      // 侧边栏
      startResize,
      sidebarExpanded,
      toggleSidebar,

      // 章节
      chapters,
      activeChapter,
      currentChapterTitle,

      // 播放器
      isPlaying,
      isFullscreen,
      autoPlay,
      playbackSpeed,
      currentPage,
      totalPages,
      progressPercent,
      formattedTime,
      totalTime: computed(() => {
        const m = Math.floor(totalTime / 60);
        const s = totalTime % 60;
        return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
      }),

      // 字幕
      subtitleText,

      // 控件
      pptContainer,
      playerControls,
      showControls,
      hideControls,
      cancelHideTimer,

      // AI
      aiMessages,
      aiInput,
      activeTab,
      sendAiMessage,

      // 方法
      goBack,
      togglePlay,
      prevPage,
      nextPage,
      toggleAutoPlay,
      toggleFullscreen,
      seekProgress,
    };
  },
};
