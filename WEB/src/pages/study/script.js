// ============================================================================
// 文件名：script.js
// 所属组件：pages/study/index.vue（课程学习页面）
// 所属目录：src/pages/study/
// 文件作用：课程学习页的全部业务逻辑模块
// 超长说明：本文件因学习页功能高度内聚（章节导航、PPT播放器、音频同步、
//           SRT字幕、AI助教、学习进度、下一章生成与自动轮询等），且各功能模块
//           共享同一组响应式状态，不宜拆分，特批允许超过 300 行限制
//
// 实现功能：
//   1. 主题切换（复用 useTheme）
//   2. 侧边栏折叠/展开
//   3. 侧边栏拖动调整宽度（useResize composable）
//   4. PPT 播放区：播放/暂停、上一页/下一页、自动播放、倍速切换
//   5. B站风格控件 hover 显示/隐藏
//   6. PPT 全屏切换
//   7. 进度条（基于真实音频时间）
//   8. AI 助教对话（占位，后续对接）
//   9. AI/口播稿 Tab 切换
//  10. 章节列表导航
//  11. 返回首页（emit 事件）
//  12. PPT HTML 幻灯片 iframe 渲染
//  13. HTML5 Audio 音频播放（每页一个音频文件）
//  14. SRT 字幕解析与时间同步显示
//  15. 课程数据 API 对接
//
// 数据流：
//   App.vue navigate("study", { courseId }) → provide studyParams
//   → StudyPage inject("studyParams") → loadCourseData() → getBookDetail()
//   → 章节列表渲染 → 点击章节 → loadChapterSlides() → getChapterSlides()
//   → 渲染 PPT iframe + 播放 audio + 同步 SRT
//
// 依赖关系：
//   输入依赖：../../composables/useTheme、../../composables/useResize、../../api/books
//   输出给：index.vue 模板（通过 setup() 返回的对象）
//
// 上次修改：2026-07-23（完善 PPT/Audio/SRT 真实数据展示）
// ============================================================================

import { ref, reactive, computed, watch, onMounted, onUnmounted, inject, nextTick } from "vue";
import { ElMessage } from "element-plus";
import { useTheme } from "../../composables/useTheme";
import { useResize } from "../../composables/useResize";
import { getBookDetail, getChapterSlides, generateNextChapter, getChapterGenerationProgress, fixMissingFiles, getFixStatus } from "../../api/books";
import { getProgress, saveProgress } from "../../api/progress"; // 学习进度保存/恢复 API

// ============================================================================
// 一、常量定义
// ============================================================================

/** 控制台日志前缀 */
const TAG = "[StudyPage]";

/** 每页展示时长（秒），仅在没有音频文件时作为 fallback 使用 */
const FALLBACK_PAGE_DURATION = 30;

/** 学习进度保存防抖定时器 */
let saveProgressTimer = null;
/** 进度保存防抖延迟（毫秒） */
const SAVE_DEBOUNCE_MS = 2000;

/** 本次学习页面打开的时间戳（用于计算学习时长增量） */
let studySessionStart = Date.now();

/** 从上次保存到现在的累计学习秒数（每次保存后清零） */
let accumulatedStudySeconds = 0;

// ============================================================================
// 二、SRT 字幕解析工具函数
// ============================================================================

/**
 * 将 SRT 格式的时间字符串转换为秒数
 * SRT 时间格式：HH:MM:SS,mmm（如 "00:00:05,120"）
 * @param {string} timeStr - SRT 时间字符串
 * @returns {number} 总秒数（浮点数，含毫秒）
 */
function srtTimeToSeconds(timeStr) {
  // 兼容中文逗号和英文逗号
  const cleaned = timeStr.replace(/，/g, ",");
  // 正则匹配 HH:MM:SS,mmm
  const match = cleaned.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) {
    console.warn(TAG + " SRT 时间格式解析失败: " + timeStr);
    return 0;
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const millis = parseInt(match[4], 10);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/**
 * 解析 SRT 字幕文本为结构化数组
 * SRT 格式示例：
 *   1
 *   00:00:00,000 --> 00:00:05,120
 *   这是第一句字幕
 *
 * @param {string} srtText - SRT 原始文本
 * @returns {Array<{start: number, end: number, text: string}>} 解析后的字幕条目数组
 */
function parseSrt(srtText) {
  if (!srtText || typeof srtText !== "string") {
    return [];
  }

  const entries = [];
  // 按空行分割 SRT 块（兼容 Windows \r\n 和 Unix \n）
  const blocks = srtText.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue; // 至少需要序号行和时间行

    // 第二行是时间范围："00:00:00,000 --> 00:00:05,120"
    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\S+)\s*-->\s*(\S+)/);
    if (!timeMatch) continue;

    const start = srtTimeToSeconds(timeMatch[1]);
    const end = srtTimeToSeconds(timeMatch[2]);
    // 第三行开始是字幕文本（可能有多行）
    const text = lines.slice(2).join(" ").trim();

    if (text) {
      entries.push({ start, end, text });
    }
  }

  return entries;
}

/**
 * 从 URL 获取 SRT 字幕文本并解析
 * @param {string} srtUrl - SRT 文件的代理访问 URL
 * @returns {Promise<Array<{start: number, end: number, text: string}>>} 解析后的字幕条目
 */
async function fetchAndParseSrt(srtUrl) {
  if (!srtUrl) {
    console.log(TAG + " srtUrl 为空，跳过字幕加载");
    return [];
  }

  try {
    console.log(TAG + " 获取 SRT: " + srtUrl);
    const response = await fetch(srtUrl);
    if (!response.ok) {
      console.warn(TAG + " SRT 文件获取失败: HTTP " + response.status);
      return [];
    }
    const srtText = await response.text();
    const entries = parseSrt(srtText);
    console.log(TAG + " SRT 解析完成，共 " + entries.length + " 条字幕");
    return entries;
  } catch (error) {
    console.warn(TAG + " SRT 获取异常: " + (error?.message || error));
    return [];
  }
}

// ============================================================================
// 三、模块默认导出
// ============================================================================

export default {
  /**
   * 使用 inject('navigate') 导航，由 App.vue provide
   * 使用 inject('studyParams') 获取课程参数，由 App.vue provide
   */
  setup() {
    // ========================================================================
    // 3.1 依赖注入
    // ========================================================================

    /** 导航函数（从 App.vue 注入） */
    const navigate = inject("navigate", (page) => {
      console.warn(TAG + " navigate 未从父组件注入，当前页: " + page);
    });

    /** 学习页参数（从 App.vue 注入，含 courseId） */
    const studyParams = inject("studyParams", null);

    // ========================================================================
    // 3.2 主题切换
    // ========================================================================
    const { isDark, toggleTheme } = useTheme();

    // ========================================================================
    // 3.3 侧边栏拖动
    // ========================================================================
    const { startResize } = useResize();

    // ========================================================================
    // 3.4 响应式数据
    // ========================================================================

    // ---- 课程加载状态 ----
    /** 页面整体加载状态 */
    const courseLoading = ref(true);
    /** 章节内容加载状态 */
    const chapterLoading = ref(false);
    /** 课程信息（来自 getBookDetail） */
    const courseInfo = ref({ name: "", subtitle: "", chapters: [] });

    // ---- 章节数据 ----
    /** 章节列表（从 API 获取，映射为 UI 需要的字段） */
    const chapters = ref([]);
    /** 当前活跃章节 ID */
    const activeChapter = ref(null);

    // ---- 幻灯片数据 ----
    /** 当前章节的幻灯片数组 [{ pageNumber, pptUrl, audioUrl, srtUrl }] */
    const slides = ref([]);
    /** PPT iframe 加载状态 */
    const pptLoading = ref(false);

    // ---- SRT 字幕 ----
    /** 解析后的 SRT 字幕条目 */
    const srtEntries = ref([]);
    /** 当前显示的字幕文本 */
    const subtitleText = ref("");

    // ---- 侧边栏 ----
    const sidebarExpanded = ref(true);

    // ---- 播放器状态 ----
    const isPlaying = ref(false);
    const isFullscreen = ref(false);
    const autoPlay = ref(true);
    const playbackSpeed = ref("1.0");
    const currentPage = ref(1);
    const totalPages = ref(0);
    const progressPercent = ref(0);
    /** 当前幻灯片内的音频播放时间（秒） */
    const currentTime = ref(0);
    /** 本章节已播放过的幻灯片累计时长（秒），用于在进度条和格式化时间中累加已播页面的时长 */
    const chapterElapsedTime = ref(0);
    /** 本章节所有已知幻灯片时长的总和（秒） */
    const chapterTotalTime = ref(0);
    /** 当前章节总时长预计算 Promise（供恢复进度时 await，确保各页 _duration 已填充后再计算已播累计时长） */
    let currentPrefetchPromise = null;

    // ---- 控件显示 ----
    let hideTimer = null;

    // ---- PPT 固定尺寸缩放渲染 ----
    /** iframe 基准渲染宽度（px），iframe 内容始终以该宽度作为内部视口，保持布局稳定 */
    const pptBaseWidth = ref(1920);
    /** iframe 基准渲染高度（px），16:9 比例 = 1920 * 9 / 16 */
    const pptBaseHeight = ref(1080);
    /** 当前缩放比例，由 updatePptScale() 根据容器实际宽度动态计算 */
    const pptScale = ref(1);

    // ---- AI 对话（后续对接） ----
    const aiMessages = ref([
      { role: "user", text: "这页的导数定义不太理解" },
      { role: "ai", text: "导数描述的是函数在某一点处的瞬时变化率。你可以想象一辆汽车的行驶——速度表上的读数就是位移对时间的导数。" },
      { role: "user", text: "Δx 趋近于 0 是什么意思？" },
      { role: "ai", text: "Δx 趋近于 0 是指自变量的变化量无限缩小，但永远不等于 0。这正是微积分的核心思想——用无限逼近的方式来研究变化。" },
    ]);
    const aiInput = ref("");

    // ---- Tab ----
    const activeTab = ref("ai");

    // ---- 下一章生成相关 ----
    /** 是否正在调用生成 API（按钮 loading 状态） */
    const isGeneratingChapter = ref(false);
    /** 自动生成模式开关（从 localStorage 读取，每个课程独立记忆） */
    const autoGenerateEnabled = ref(false);
    /** 章节生成进度映射表 { [chapterId]: { progress, isTerminal } } */
    const chapterProgressMap = reactive({});
    /** 章节进度轮询定时器引用 */
    let chapterProgressTimer = null;
    /** 轮询间隔（毫秒），与首页保持一致 */
    const CHAPTER_POLL_INTERVAL = 3000;

    // ---- 文件补全相关 ----
    /** 是否正在补全缺失文件 */
    const isFixingMissing = ref(false);
    /** 补全横幅提示文字 */
    const fixingBannerText = ref("");
    /** 补全状态轮询定时器 */
    let fixStatusTimer = null;
    /** 当前章节是否已触发过补全检测（防止重复触发） */
    const fixCheckTriggered = ref(false);

    // ---- DOM 引用 ----
    const pptContainer = ref(null);
    const playerControls = ref(null);
    const audioRef = ref(null);
    /** PPT 缩放：ResizeObserver 实例引用，用于监听容器尺寸变化并动态计算缩放比 */
    let pptResizeObserver = null;
    /** PPT 缩放：requestAnimationFrame ID，用于防抖合并 resize 回调 */
    let pptResizeRafId = null;

    // ========================================================================
    // 3.5 计算属性
    // ========================================================================

    /** 当前幻灯片数据 */
    const currentSlide = computed(() => {
      if (slides.value.length === 0 || currentPage.value < 1) return null;
      return slides.value[currentPage.value - 1] || null;
    });

    /** 当前 PPT URL */
    const currentPptUrl = computed(() => {
      return currentSlide.value?.pptUrl || "";
    });

    /** 当前音频 URL */
    const currentAudioUrl = computed(() => {
      return currentSlide.value?.audioUrl || "";
    });

    /** 当前口播稿（从大纲 JSON 的 script 字段获取） */
    const currentScript = computed(() => {
      return currentSlide.value?.script || "";
    });

    /** 当前助教提示（从大纲 JSON 的 zjts 字段获取） */
    const currentZjts = computed(() => {
      return currentSlide.value?.zjts || "";
    });

    /** 已完成或部分完成的有效章节状态集合 */
    const VALID_COMPLETED_STATUSES = ["completed", "partial_completed"];

    /** 生成下一章按钮：是否禁用 */
    const generateBtnDisabled = computed(() => {
      // 加载中 → 禁用
      if (courseLoading.value) return true;
      // 正在生成中 → 禁用（el-button 的 :loading 已覆盖，此处做双重保护）
      if (isGeneratingChapter.value) return true;
      // 后端判断不可生成 → 禁用
      return !(courseInfo.value?.canGenerateNext ?? false);
    });

    /** 生成下一章按钮：提示文本 */
    const generateBtnText = computed(() => {
      // 加载中
      if (courseLoading.value) return "加载中...";
      // 正在生成中
      if (isGeneratingChapter.value) return "正在生成中...";
      // 后端判断可以生成
      if (courseInfo.value?.canGenerateNext) return "生成下一章";
      // 不可生成（全部内容已完毕 / 尚无章节）
      return "已经是最后一章了";
    });

    /** 当前章节标题 */
    const currentChapterTitle = computed(() => {
      if (!activeChapter.value) return "";
      const ch = chapters.value.find((c) => c.id === activeChapter.value);
      return ch ? ch.title : "";
    });

    /** 音频总时长（秒） — 仅当前页面音频，保留用于 onAudioLoaded */
    const totalTime = ref(0);

    /** 格式化显示的当前时间 MM:SS = 已播幻灯片累计 + 当前页播放位置（处理 NaN/Infinity） */
    const formattedTime = computed(() => {
      const time = chapterElapsedTime.value + currentTime.value;
      if (time === undefined || time === null || !isFinite(time) || time < 0) {
        return "00:00";
      }
      const mins = Math.floor(time / 60);
      const secs = Math.floor(time % 60);
      return String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
    });

    /** 格式化显示的总时长 MM:SS = 章节所有幻灯片累计时长（处理 NaN/Infinity） */
    const formattedTotalTime = computed(() => {
      const duration = chapterTotalTime.value;
      if (duration === undefined || duration === null || !isFinite(duration) || duration < 0) {
        return "00:00";
      }
      const mins = Math.floor(duration / 60);
      const secs = Math.floor(duration % 60);
      return String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
    });

    // ========================================================================
    // 3.6 数据加载
    // ========================================================================

    /**
     * 防抖保存学习进度到后端
     * 在翻页或切换章节后调用，2 秒内多次调用只执行最后一次
     * 保存失败时静默处理，不影响用户学习体验
     */
    function saveProgressDebounced() {
      // 清除之前的定时器，重新计时
      if (saveProgressTimer) clearTimeout(saveProgressTimer);
      saveProgressTimer = setTimeout(async () => {
        const courseId = studyParams?.value?.courseId;
        // 缺少必要参数时跳过保存
        if (!courseId || !activeChapter.value) return;
        try {
          // 计算自上次保存以来的学习时间增量
          const now = Date.now();
          const elapsedSeconds = Math.floor((now - studySessionStart) / 1000) + accumulatedStudySeconds;
          // 重置计时起点，准备下一段计时
          studySessionStart = now;
          accumulatedStudySeconds = 0;

          await saveProgress({
            courseId,
            chapterId: activeChapter.value,
            progress: currentPage.value,
            studyDuration: elapsedSeconds > 0 ? elapsedSeconds : undefined, // 仅在有实际时长时发送
          });
          console.log(TAG + " 学习进度已保存（防抖），时长增量: " + elapsedSeconds + "s");
        } catch (e) {
          // 保存失败时保留累计时长，下次保存时一并发送
          accumulatedStudySeconds += Math.floor((Date.now() - studySessionStart) / 1000);
          studySessionStart = Date.now();
          console.warn(TAG + " 学习进度保存失败: " + (e?.message || e));
        }
      }, SAVE_DEBOUNCE_MS);
    }

    /**
     * 加载课程数据（章节列表）
     * 调用 GET /api/v1/books/:id 获取课程信息与章节列表
     */
    async function loadCourseData() {
      if (!studyParams?.value?.courseId) {
        console.warn(TAG + " studyParams 中没有 courseId，无法加载课程数据");
        courseLoading.value = false;
        return;
      }

      const courseId = studyParams.value.courseId;
      console.log(TAG + " 开始加载课程数据，courseId: " + courseId);

      try {
        const result = await getBookDetail(courseId);

        if (result.code === 0 && result.data) {
          const data = result.data;
          courseInfo.value = {
            name: data.name || "未命名课程",
            subtitle: data.subtitle || "",
            pipelineStatus: data.pipelineStatus || "",
            pipelineProgress: data.pipelineProgress || null, // 流水线进度（含 isLastChapter 标记）
            maxline: data.maxline || 0,  // 【新增】MD 文件总行数
            canGenerateNext: data.canGenerateNext ?? false,  // 【新增】后端权威值：是否可以生成下一章
          };

          // 将章节数据映射为 UI 所需格式
          chapters.value = (data.chapters || []).map((ch) => ({
            id: ch.id,
            title: ch.name || "未命名章节",
            duration: "—", // 时长由各页音频汇总，此处显示待计算
            status: ch.status || "pending", // pending / generating / completed / failed
            sequence: ch.sequence,
            totalPages: ch.totalPages || 0,
          }));

          console.log(TAG + " 课程数据加载成功，共 " + chapters.value.length + " 个章节");

          // ========== 尝试从服务端恢复上次的学习进度（课程记忆功能） ==========
          let restoredChapter = null;  // 恢复的目标章节
          let restoredPage = 1;        // 恢复的目标页码
          try {
            const progressResult = await getProgress(courseId);
            // code 200 表示有历史学习记录
            if (progressResult.code === 200 && progressResult.data) {
              const { chapterId, progress: savedPage } = progressResult.data;
              // 查找恢复的章节是否存在且已完成/部分完成
              const targetCh = chapters.value.find((c) => String(c.id) === String(chapterId));
              if (targetCh && VALID_COMPLETED_STATUSES.includes(targetCh.status)) {
                restoredChapter = targetCh;
                restoredPage = savedPage;
                console.log(TAG + " 检测到上次学习进度：章节 " + targetCh.title + "，第 " + savedPage + " 页");
              } else {
                console.log(TAG + " 上次学习的章节已不可用，从默认章节开始");
              }
            }
          } catch (e) {
            // 查询进度失败不影响正常使用，从默认位置开始
            console.warn(TAG + " 查询学习进度失败: " + (e?.message || e));
          }

          // ========== 选中目标章节：优先恢复上次进度，其次选第一个已完成/部分完成章节 ==========
          if (chapters.value.length > 0) {
            let targetChapter;
            if (restoredChapter) {
              targetChapter = restoredChapter;
            } else {
              const firstCompleted = chapters.value.find((c) => VALID_COMPLETED_STATUSES.includes(c.status));
              targetChapter = firstCompleted || chapters.value[0];
            }
            activeChapter.value = targetChapter.id;
            // 加载该章节的幻灯片
            await loadChapterSlides(targetChapter.id);

            // 如果是从进度恢复的，加载完成后跳转到保存的页码
            if (restoredPage > 1 && restoredPage <= totalPages.value) {
              // 等待章节总时长预计算完成，确保各页 _duration 已填充，才能准确计算已播累计时长
              if (currentPrefetchPromise) {
                try {
                  await currentPrefetchPromise;
                } catch (e) {
                  console.warn(TAG + " 等待章节总时长预计算失败（不影响恢复页码）: " + (e?.message || e));
                }
              }

              currentPage.value = restoredPage;

              // 累加前 restoredPage-1 页的时长到已播累计时长（修复恢复进度后进度条显示 00:00）
              let elapsedSum = 0;
              for (let i = 0; i < restoredPage - 1; i++) {
                elapsedSum += (slides.value[i]?._duration || 0);
              }
              chapterElapsedTime.value = elapsedSum;

              // 同步更新进度条百分比
              if (chapterTotalTime.value > 0) {
                progressPercent.value = Math.round((elapsedSum / chapterTotalTime.value) * 100);
              }

              console.log(TAG + " 已恢复到第 " + restoredPage + " 页，已播累计: " + elapsedSum.toFixed(1) + "s，章节总时长: " + chapterTotalTime.value.toFixed(1) + "s");

              // 页码变更后重新加载字幕
              await nextTick();
              await loadCurrentSrt();
              console.log(TAG + " 已恢复到第 " + restoredPage + " 页");
            }
          }
        } else {
          console.warn(TAG + " 课程数据加载失败: " + (result.message || "未知错误"));
          ElMessage.error("课程数据加载失败");
        }
      } catch (error) {
        console.error(TAG + " 课程数据加载异常: " + (error?.message || error));
        ElMessage.error("课程数据加载失败，请稍后重试");
      } finally {
        courseLoading.value = false;
      }
    }

    /**
     * 加载指定章节的幻灯片数据
     * 调用 GET /api/v1/courses/:courseId/chapters/:chapterId/slides
     * @param {string|number} chapterId - 章节 ID
     */
    async function loadChapterSlides(chapterId) {
      const courseId = studyParams?.value?.courseId;
      if (!courseId || !chapterId) {
        console.warn(TAG + " 缺少 courseId 或 chapterId，无法加载幻灯片");
        return;
      }

      console.log(TAG + " 加载章节幻灯片，chapterId: " + chapterId);
      chapterLoading.value = true;

      try {
        const result = await getChapterSlides(courseId, chapterId);

        if (result.code === 0 && result.data) {
          const { chapter, slides: slidesData } = result.data;

          slides.value = slidesData || [];
          totalPages.value = chapter.totalPages || slidesData.length;
          currentPage.value = 1;
          currentTime.value = 0;
          progressPercent.value = 0;
          isPlaying.value = false;
          // 重置章节累计时间
          chapterElapsedTime.value = 0;
          chapterTotalTime.value = 0;

          console.log(TAG + " 章节幻灯片加载成功: " + chapter.name + "，共 " + slides.value.length + " 页");

          // 预加载第一页字幕
          await loadCurrentSrt();

          // 异步预计算章节总时长：并行 fetch 所有 SRT 文件，从最后一帧时间推算各页时长
          // 将 Promise 保存起来，供恢复学习进度时 await，确保各页 _duration 已填充
          currentPrefetchPromise = prefetchChapterTotalTime();

          // 重置 PPT iframe 加载状态
          // 注意：如果 PPT URL 未变化（如补全完成后重新加载同一章节），iframe 不会重新渲染，
          // onPptLoad 不会被触发，因此不能重置 pptLoading 为 true
          const pptUrlChanged = (() => {
            const current = currentPptUrl.value;
            return !current || current !== (slidesData[0]?.pptUrl || "");
          })();
          if (pptUrlChanged) {
            pptLoading.value = true;
          }

          // 如果后端已触发补全（chapter.isFixingMissing === true），立即显示横幅并启动轮询
          // 跳过前端采样检测，避免重复触发 fixMissingFiles API
          if (chapter.isFixingMissing) {
            console.log(TAG + " [文件补全] 后端已触发补全，立即显示横幅并启动轮询");
            isFixingMissing.value = true;
            fixingBannerText.value = "检测到部分文件缺失，正在自动补全...";
            startFixStatusPolling(courseId, chapterId);
          } else {
            // 幻灯片加载完成后，检测文件完整性（仅 partial_completed 章节）
            detectAndFixMissingFiles();
          }
        } else {
          console.warn(TAG + " 章节幻灯片加载失败: " + (result.message || "未知错误"));
          ElMessage.error("章节内容加载失败");
          slides.value = [];
          totalPages.value = 0;
        }
      } catch (error) {
        console.error(TAG + " 章节幻灯片加载异常: " + (error?.message || error));
        ElMessage.error("章节内容加载失败，请稍后重试");
        slides.value = [];
        totalPages.value = 0;
      } finally {
        chapterLoading.value = false;
      }
    }

    /**
     * 检测当前章节文件完整性，对缺失文件触发自动补全
     * 仅在章节状态为 partial_completed 且尚未触发过检测时执行
     * 采用轻量抽样探测：只检查第一页、中间页、最后一页的 SRT 文件是否存在
     */
    async function detectAndFixMissingFiles() {
      // 守卫：仅 partial_completed 章节触发
      const currentChapter = chapters.value.find(c => String(c.id) === String(activeChapter.value));
      if (!currentChapter || currentChapter.status !== "partial_completed") {
        return;
      }
      // 守卫：已触发过不再重复
      if (fixCheckTriggered.value) {
        return;
      }
      fixCheckTriggered.value = true;
      console.log(TAG + " [文件补全] 检测 partial_completed 章节文件完整性...");

      const courseId = studyParams?.value?.courseId;
      if (!courseId || !activeChapter.value) return;

      // 轻量抽样探测：取第一页、中间页、最后一页的 SRT 做 HEAD 请求
      const testIndices = [];
      if (slides.value.length > 0) testIndices.push(0); // 第一页
      if (slides.value.length > 2) testIndices.push(Math.floor(slides.value.length / 2)); // 中间页
      if (slides.value.length > 1) testIndices.push(slides.value.length - 1); // 最后一页

      let hasMissing = false;
      for (const idx of testIndices) {
        const srtUrl = slides.value[idx]?.srtUrl;
        if (!srtUrl) continue;
        try {
          const resp = await fetch(srtUrl, { method: "HEAD" });
          if (!resp.ok) {
            console.log(TAG + " [文件补全] 抽样检测到缺失: " + srtUrl + " (HTTP " + resp.status + ")");
            hasMissing = true;
            break; // 发现一处缺失即触发补全
          }
        } catch (e) {
          console.log(TAG + " [文件补全] 抽样检测网络异常: " + (e?.message || e));
          hasMissing = true;
          break;
        }
      }

      if (!hasMissing) {
        console.log(TAG + " [文件补全] 抽样检测通过，无需补全");
        return;
      }

      // 触发补全
      console.log(TAG + " [文件补全] 检测到文件缺失，触发自动补全...");
      isFixingMissing.value = true;
      fixingBannerText.value = "检测到部分文件缺失，正在自动补全...";

      try {
        const result = await fixMissingFiles(courseId, activeChapter.value);
        if (result.code === 0 || result.code === 409) {
          // 任务已启动或已有进行中任务，开始轮询
          startFixStatusPolling(courseId, activeChapter.value);
        } else {
          // 失败时隐藏横幅
          console.warn(TAG + " [文件补全] 触发失败: " + (result.message || "未知错误"));
          isFixingMissing.value = false;
          fixingBannerText.value = "";
        }
      } catch (e) {
        console.warn(TAG + " [文件补全] 触发异常: " + (e?.message || e));
        isFixingMissing.value = false;
        fixingBannerText.value = "";
      }
    }

    /**
     * 启动文件补全状态轮询
     * 每 3 秒查询补全状态，完成后刷新 slides 数据并隐藏横幅
     * @param {string} courseId - 课程 ID
     * @param {string} chapterId - 章节 ID
     */
    function startFixStatusPolling(courseId, chapterId) {
      if (fixStatusTimer) clearInterval(fixStatusTimer);

      console.log(TAG + " [文件补全] 开始轮询补全状态（间隔 3 秒）");
      fixStatusTimer = setInterval(async () => {
        try {
          const result = await getFixStatus(courseId, chapterId);
          if (result.code === 0 && result.data) {
            const { isFixing } = result.data;
            if (!isFixing) {
              // 补全已完成
              console.log(TAG + " [文件补全] 补全完成，刷新章节数据");
              stopFixStatusPolling();
              // 刷新 slides 数据
              await loadChapterSlides(chapterId);
              // 刷新课程数据以更新章节状态
              await loadCourseData();
              // 隐藏横幅
              isFixingMissing.value = false;
              fixingBannerText.value = "";
            }
          }
        } catch (_) {
          // 轮询失败静默处理
        }
      }, 3000);
    }

    /** 停止文件补全状态轮询 */
    function stopFixStatusPolling() {
      if (fixStatusTimer) {
        clearInterval(fixStatusTimer);
        fixStatusTimer = null;
        console.log(TAG + " [文件补全] 轮询已停止");
      }
    }

    /**
     * 异步预计算章节总时长
     * 并行 fetch 所有 SRT 文件，从每页最后一帧的 end 时间推算该页时长，累加为章节总时长
     * SRT 文件通常只有 1~5KB，20 页并行 fetch 也能在秒级完成
     */
    async function prefetchChapterTotalTime() {
      console.log(TAG + " 开始预计算章节总时长，共 " + slides.value.length + " 页...");

      try {
        // 并行 fetch 所有 SRT 文件
        const fetches = slides.value.map(async (slide, idx) => {
          if (!slide.srtUrl) return 0;
          try {
            const entries = await fetchAndParseSrt(slide.srtUrl);
            if (entries.length > 0) {
              const duration = entries[entries.length - 1].end; // 最后一帧结束时间即该页时长
              slide._duration = duration; // 缓存到 slide 数据中，后续 onAudioLoaded 不会重复覆盖
              console.log(TAG + " 页 " + (idx + 1) + " 预估时长: " + duration.toFixed(1) + "s");
              return duration;
            }
          } catch (e) {
            console.warn(TAG + " 页 " + (idx + 1) + " SRT 预读失败: " + e.message);
          }
          return 0;
        });

        const durations = await Promise.all(fetches);
        const total = durations.reduce((sum, d) => sum + d, 0);

        if (total > 0) {
          chapterTotalTime.value = total;
          console.log(TAG + " 章节总时长计算完成: " + total.toFixed(1) + "s");
        }
      } catch (error) {
        console.warn(TAG + " 预计算章节总时长失败: " + (error?.message || error));
        // 失败不影响播放，后续通过 onAudioLoaded 逐步累积
      }
    }

    /**
     * 加载当前幻灯片对应的 SRT 字幕
     * 注意：调用前会先清空旧字幕数据，防止翻页时显示旧内容
     */
    async function loadCurrentSrt() {
      // 先清空旧字幕数据，防止翻页时短暂显示旧内容
      srtEntries.value = [];
      subtitleText.value = "";

      if (!currentSlide.value?.srtUrl) {
        return;
      }

      try {
        srtEntries.value = await fetchAndParseSrt(currentSlide.value.srtUrl);
        // 根据当前播放时间显示对应字幕（新页面时间已重置为 0）
        updateSubtitleFromTime(currentTime.value);
      } catch (error) {
        console.warn(TAG + " 字幕加载异常: " + (error?.message || error));
        srtEntries.value = [];
        subtitleText.value = "";
      }
    }

    /**
     * 根据当前音频播放时间，更新显示的字幕文本
     * @param {number} timeSeconds - 当前播放时间（秒）
     */
    function updateSubtitleFromTime(timeSeconds) {
      if (srtEntries.value.length === 0) {
        subtitleText.value = "";
        return;
      }

      // 查找当前时间对应的字幕条目（二分查找）
      let found = null;
      for (const entry of srtEntries.value) {
        if (timeSeconds >= entry.start && timeSeconds <= entry.end) {
          found = entry;
          break;
        }
      }

      subtitleText.value = found ? found.text : "";
    }

    // ========================================================================
    // 3.7 导航
    // ========================================================================

    /** 返回首页 */
    function goBack() {
      console.log(TAG + " 返回首页");
      navigate("home");
    }

    // ========================================================================
    // 3.8 侧边栏
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
    // 3.9 章节切换
    // ========================================================================

    /**
     * 点击章节列表项，切换到指定章节
     * @param {string|number} chapterId - 章节 ID
     */
    async function switchChapter(chapterId) {
      // 守卫：文件补全进行中，禁止切换章节，防止干扰补全过程
      if (isFixingMissing.value) {
        console.log(TAG + " 文件补全进行中，禁止切换章节");
        ElMessage.warning("正在修复文件，请稍候再切换章节");
        return;
      }
      // 守卫：查找目标章节状态，非 completed 或 partial_completed 阻止切换
      const targetChapter = chapters.value.find(c => String(c.id) === String(chapterId));
      if (!targetChapter) {
        console.warn(TAG + " 章节不存在: " + chapterId);
        return;
      }
      if (!VALID_COMPLETED_STATUSES.includes(targetChapter.status)) {
        showGeneratingTip(targetChapter);
        return;
      }
      if (chapterId === activeChapter.value) return; // 已经是当前章节，不重复加载
      console.log(TAG + " 切换章节: " + chapterId);
      activeChapter.value = chapterId;
      fixCheckTriggered.value = false; // 重置补全检测标记
      await loadChapterSlides(chapterId);
      // 切换章节后保存学习进度（防抖）
      saveProgressDebounced();

      // 自动生成检查：如果开启了自动生成，检查是否需要生成下一章
      if (autoGenerateEnabled.value) {
        autoGenerateCheck(targetChapter);
      }
    }

    /**
     * 自动生成检查：学习第 N 章时，检查是否需要生成第 N+1 章
     * @param {Object} currentChapter - 当前正在学习的章节对象
     */
    function autoGenerateCheck(currentChapter) {
      const currentSeq = currentChapter.sequence;
      const nextSeq = currentSeq + 1;

      // 查找是否已存在第 N+1 章
      const nextChapter = chapters.value.find(c => c.sequence === nextSeq);

      if (!nextChapter) {
        // 不存在 → 自动生成
        console.log(TAG + " [自动生成] 检测到第 " + currentSeq + " 章，自动生成第 " + nextSeq + " 章");
        handleGenerateNextChapter(true); // silent=true，不显示错误消息
      }
      // 存在且 generating → 启动轮询（由 startChapterProgressPolling 处理）
      // 存在且 completed → 无需操作
    }

    /**
     * 非已完成章节点击处理（提示已内联到模板中，此处为空函数仅作为占位）
     * @param {Object} chapter - 章节对象
     */
    function showGeneratingTip(chapter) {
      // pending/failed 提示已在侧边栏内联显示，generating 进度条也已在模板中渲染
      // 该函数保留仅用于兼容模板中的 @click 绑定，不执行任何操作
    }

    /**
     * 处理"生成下一章"按钮点击
     * @param {boolean} silent - 静默模式（自动生成时不显示错误消息）
     */
    async function handleGenerateNextChapter(silent = false) {
      const courseId = studyParams?.value?.courseId;
      if (!courseId) {
        if (!silent) ElMessage.error("无法获取课程信息");
        return;
      }

      if (isGeneratingChapter.value) return; // 防止重复点击
      isGeneratingChapter.value = true;
      console.log(TAG + " [生成下一章] 开始，courseId: " + courseId);

      try {
        const result = await generateNextChapter(courseId);

        if (result.code === 0 && result.data) {
          const { chapterId, sequence, name, status } = result.data;
          console.log(TAG + " [生成下一章] 创建成功，chapterId: " + chapterId + "，sequence: " + sequence);

          // 将新章节添加到列表中
          chapters.value.push({
            id: chapterId,
            title: name,
            duration: "—",
            status: status,
            sequence: sequence,
            totalPages: 0,
          });
          // 按 sequence 排序
          chapters.value.sort((a, b) => a.sequence - b.sequence);

          // 启动进度轮询
          startChapterProgressPolling();

          if (!silent) {
            ElMessage.success("第 " + sequence + " 章已开始生成");
          }
        } else {
          if (!silent) {
            ElMessage.warning(result.message || "生成下一章失败");
          }
          console.warn(TAG + " [生成下一章] 失败: " + (result.message || "未知错误"));
        }
      } catch (error) {
        console.error(TAG + " [生成下一章] 异常: " + (error?.message || error));
        if (!silent) {
          ElMessage.error("生成下一章失败，请稍后重试");
        }
      } finally {
        isGeneratingChapter.value = false;
      }
    }

    /**
     * 自动生成开关变更回调
     * @param {boolean} enabled - 开关状态
     */
    function onAutoGenerateToggle(enabled) {
      const courseId = studyParams?.value?.courseId;
      if (!courseId) return;
      const key = "auto_generate_" + courseId;
      if (enabled) {
        localStorage.setItem(key, "1");
        console.log(TAG + " 自动生成模式已开启");
      } else {
        localStorage.removeItem(key);
        console.log(TAG + " 自动生成模式已关闭");
      }
    }

    // ===== 章节进度轮询函数 =====

    /**
     * 启动章节进度轮询（检测到 generating 状态的章节时调用）
     */
    function startChapterProgressPolling() {
      if (chapterProgressTimer) {
        clearInterval(chapterProgressTimer); // 先清除已有定时器
      }
      chapterProgressTimer = null;

      const courseId = studyParams?.value?.courseId;
      if (!courseId) return;

      console.log(TAG + " 启动章节进度轮询（间隔 " + CHAPTER_POLL_INTERVAL + "ms）");
      chapterProgressTimer = setInterval(async () => {
        // 查找所有 generating 状态的章节
        const generatingChapters = chapters.value.filter(c => c.status === "generating");
        if (generatingChapters.length === 0) {
          console.log(TAG + " 无生成中章节，停止轮询");
          stopChapterProgressPolling();
          return;
        }

        // 轮询每个生成中章节的进度
        for (const ch of generatingChapters) {
          try {
            const result = await getChapterGenerationProgress(courseId, ch.id);
            if (result.code === 0 && result.data) {
              const { chapterStatus, progress, isTerminal } = result.data;

              // 更新进度映射表
              chapterProgressMap[ch.id] = { progress, isTerminal };

              // 如果章节生成完成，更新本地状态并刷新课程数据
              if (isTerminal) {
                console.log(TAG + " 章节 " + ch.id + " 已结束，状态: " + chapterStatus);
                // 更新本地章节状态
                ch.status = chapterStatus;
                if (chapterStatus === "completed") {
                  ElMessage.success("「" + ch.title + "」已生成完成");
                }
                // 清除该章节的进度数据
                delete chapterProgressMap[ch.id];
              }
            }
          } catch (_) {
            // 轮询失败静默处理
          }
        }

        // 检查是否还有生成中的章节
        const stillGenerating = chapters.value.some(c => c.status === "generating");
        if (!stillGenerating) {
          stopChapterProgressPolling();
        }
      }, CHAPTER_POLL_INTERVAL);
    }

    /** 停止章节进度轮询 */
    function stopChapterProgressPolling() {
      if (chapterProgressTimer) {
        clearInterval(chapterProgressTimer);
        chapterProgressTimer = null;
        console.log(TAG + " 章节进度轮询已停止");
      }
    }

    // ===== 章节进度条辅助函数（供模板调用） =====

    /**
     * 获取章节进度阶段文字
     * @param {Object} chapter - 章节对象
     * @returns {string} 阶段文字
     */
    function getChapterProgressLabel(chapter) {
      const data = chapterProgressMap[chapter.id];
      if (!data || !data.progress) return "正在准备中...";

      const phase = data.progress.phase;
      const ep = data.progress.elaborationProgress || {};
      const fp = data.progress.filesProgress || {};

      switch (phase) {
        case "outline_generating":
          return "正在生成大纲";
        case "elaborating":
          return "正在扩写口播稿 " + (ep.current || 0) + "/" + (ep.total || "?");
        case "ppt_generating":
          return "正在生成课件 " + (fp.current || 0) + "/" + (fp.total || "?");
        case "validating":
          return "正在检查完整性";
        default:
          return "正在生成中...";
      }
    }

    /**
     * 获取章节进度条宽度百分比
     * @param {Object} chapter - 章节对象
     * @returns {string} CSS 宽度值（如 "45%"）
     */
    function getChapterProgressBarWidth(chapter) {
      const data = chapterProgressMap[chapter.id];
      if (!data || !data.progress) return "0%";

      const phase = data.progress.phase;
      switch (phase) {
        case "outline_generating": {
          const op = data.progress.outlineProgress || {};
          const pct = op.percentage || 0;
          return Math.min(100, Math.max(0, pct)) + "%";
        }
        case "elaborating": {
          const ep = data.progress.elaborationProgress || {};
          if (ep.total > 0) return Math.round((ep.current / ep.total) * 100) + "%";
          return "0%";
        }
        case "ppt_generating": {
          const fp = data.progress.filesProgress || {};
          if (fp.total > 0) return Math.round((fp.current / fp.total) * 100) + "%";
          return "0%";
        }
        case "validating":
          return "80%";
        default:
          return "0%";
      }
    }

    /**
     * 获取章节进度百分比/计数文字
     * @param {Object} chapter - 章节对象
     * @returns {string} 百分比或计数文字
     */
    function getChapterProgressCountText(chapter) {
      const data = chapterProgressMap[chapter.id];
      if (!data || !data.progress) return "";

      const phase = data.progress.phase;
      switch (phase) {
        case "outline_generating": {
          const op = data.progress.outlineProgress || {};
          return (op.percentage || 0) + "%";
        }
        case "elaborating": {
          const ep = data.progress.elaborationProgress || {};
          return (ep.current || 0) + "/" + (ep.total || "?");
        }
        case "ppt_generating": {
          const fp = data.progress.filesProgress || {};
          return (fp.current || 0) + "/" + (fp.total || "?");
        }
        case "validating":
          return "";
        default:
          return "";
      }
    }

    // ========================================================================
    // 3.10 播放器控制
    // ========================================================================

    function togglePlay() {
      const audio = audioRef.value;
      if (!audio) {
        console.warn(TAG + " audio 元素未就绪，无法切换播放状态");
        return;
      }

      if (isPlaying.value) {
        audio.pause();
        isPlaying.value = false;
        console.log(TAG + " 暂停");
      } else {
        // 播放前先确保音频已加载
        audio.play().then(() => {
          isPlaying.value = true;
          console.log(TAG + " 播放");
        }).catch((err) => {
          console.warn(TAG + " 音频播放失败: " + (err?.message || err));
        });
      }
    }

    /**
     * 切换到指定页码的幻灯片
     * @param {number} page - 目标页码（1-based）
     * @param {boolean} shouldAutoResume - 切换后是否自动播放（用于音频结束自动翻页场景）
     */
    async function goToPage(page, shouldAutoResume = false) {
      if (page < 1 || page > totalPages.value) return;
      if (page === currentPage.value) return;

      console.log(TAG + " 切换幻灯片: " + currentPage.value + " → " + page + (shouldAutoResume ? "（自动恢复播放）" : ""));

      // 暂停当前音频
      const audio = audioRef.value;
      const wasPlaying = isPlaying.value;
      if (audio) {
        audio.pause();
        isPlaying.value = false;
      }

      // 累加当前页的已播放时长到章节累计（无论前进还是后退都不丢进度）
      // 如果是自动翻页（onAudioEnded 触发），chapterElapsedTime 已在 onAudioEnded 中累加过，此处避免重复累加
      if (!shouldAutoResume) {
        const currentSlideData = slides.value[currentPage.value - 1];
        const currentDuration = currentSlideData?._duration || totalTime.value || 0;
        chapterElapsedTime.value += currentDuration;
        console.log(TAG + " 手动翻页，累加当前页时长: " + currentDuration.toFixed(1) + "s，累计已播: " + chapterElapsedTime.value.toFixed(1) + "s");
      }

      // 如果是后退，重新计算已播放累计时长（确保准确）
      if (page < currentPage.value) {
        let sum = 0;
        for (let i = 0; i < page - 1; i++) {
          sum += (slides.value[i]?._duration || 0);
        }
        chapterElapsedTime.value = sum;
        console.log(TAG + " 后退翻页，重新计算累计已播: " + sum.toFixed(1) + "s");
      }

      // 更新页码，重置当前页音频时间为0
      currentPage.value = page;
      currentTime.value = 0;
      pptLoading.value = true;

      // 进度条基于章节累计时间计算，不从0开始（当前页音频还未播放，currentTime=0）
      if (chapterTotalTime.value > 0) {
        progressPercent.value = Math.round((chapterElapsedTime.value / chapterTotalTime.value) * 100);
      } else {
        progressPercent.value = 0;
      }

      // 等待 Vue 响应式更新后加载新字幕
      await nextTick();
      await loadCurrentSrt();

      // 翻页后保存学习进度（防抖）
      saveProgressDebounced();

      // 自动恢复播放：要么之前在播放，要么明确要求自动恢复（如音频结束自动翻页）
      if (wasPlaying || shouldAutoResume) {
        // 使用 nextTick 确保 src 已更新
        await nextTick();
        const newAudio = audioRef.value;
        if (newAudio) {
          newAudio.play().then(() => {
            isPlaying.value = true;
          }).catch((err) => {
            console.warn(TAG + " 切换后音频播放失败: " + (err?.message || err));
          });
        }
      }
    }

    function prevPage() {
      goToPage(currentPage.value - 1);
    }

    function nextPage() {
      goToPage(currentPage.value + 1);
    }

    function toggleAutoPlay() {
      autoPlay.value = !autoPlay.value;
      console.log(TAG + " 自动播放: " + autoPlay.value);
    }

    /** 点击进度条跳转 */
    function seekProgress(e) {
      const audio = audioRef.value;
      if (!audio || totalTime.value <= 0) return;

      const bar = e.currentTarget;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      audio.currentTime = pct * totalTime.value;
      currentTime.value = audio.currentTime;
      progressPercent.value = Math.round(pct * 100);
    }

    // ---- 音频事件处理 ----

    /** 音频时间更新 */
    function onAudioTimeUpdate() {
      const audio = audioRef.value;
      if (!audio) return;

      currentTime.value = audio.currentTime;
      // 进度条使用章节累计时间：已播幻灯片时长 + 当前页播放位置
      const effective = chapterElapsedTime.value + audio.currentTime;
      if (chapterTotalTime.value > 0) {
        progressPercent.value = Math.round((effective / chapterTotalTime.value) * 100);
      }
      // 同步更新 SRT 字幕
      updateSubtitleFromTime(audio.currentTime);
    }

    /** 音频播放结束 */
    function onAudioEnded() {
      console.log(TAG + " 音频播放结束");
      isPlaying.value = false;

      // 将当前页的时长累加到已播放时长中
      const currentSlideData = slides.value[currentPage.value - 1];
      const currentDuration = currentSlideData?._duration || totalTime.value || 0;
      chapterElapsedTime.value += currentDuration;

      // 如果启用了自动播放且不是最后一页，自动切换到下一页并恢复播放
      if (autoPlay.value && currentPage.value < totalPages.value) {
        console.log(TAG + " 自动播放下一张幻灯片，累计已播: " + chapterElapsedTime.value.toFixed(1) + "s");
        goToPage(currentPage.value + 1, true); // 传入 true 要求切换后自动播放
      }
    }

    /** 音频元数据加载完成（获取总时长，记录到章节累计） */
    function onAudioLoaded() {
      const audio = audioRef.value;
      if (!audio) return;

      const duration = audio.duration || 0;
      totalTime.value = duration;
      console.log(TAG + " 当前页音频时长: " + duration.toFixed(1) + "s");

      // 如果该页还没有记录过时长（SRT 预计算可能已设置），记录并更新总时长
      const currentSlideData = slides.value[currentPage.value - 1];
      if (currentSlideData && !currentSlideData._duration && duration > 0) {
        currentSlideData._duration = duration;
        // 重新汇总所有已知页面的时长
        let sum = 0;
        for (const s of slides.value) {
          sum += (s._duration || 0);
        }
        chapterTotalTime.value = sum;
        console.log(TAG + " 章节累计时长更新: " + sum.toFixed(1) + "s");
      }
    }

    /** 音频加载错误 */
    function onAudioError() {
      console.warn(TAG + " 音频加载失败，src: " + currentAudioUrl.value);
      // 使用 fallback 时长
      if (totalTime.value <= 0) {
        totalTime.value = FALLBACK_PAGE_DURATION;
      }
    }

    // 监听播放倍速变化，应用到 audio 元素
    watch(playbackSpeed, (newSpeed) => {
      const audio = audioRef.value;
      if (audio) {
        audio.playbackRate = parseFloat(newSpeed);
        console.log(TAG + " 播放倍速: " + newSpeed + "x");
      }
    });

    // 监听当前幻灯片变化，自动更新助教提示消息
    watch(currentZjts, (zjts) => {
      if (zjts && zjts.trim()) {
        // 有助教提示时，清空旧消息并添加当前页的助教提示
        aiMessages.value = [{ role: "ai", text: zjts }];
      } else {
        // 无助教提示时，清空消息列表
        aiMessages.value = [];
      }
    }, { immediate: true });

    // ---- PPT 加载完成 ----
    function onPptLoad() {
      pptLoading.value = false;
      console.log(TAG + " PPT 幻灯片加载完成，第 " + currentPage.value + " 页");
      // iframe 加载后重新计算缩放比（容器尺寸可能已变化）
      updatePptScale();
    }

    /**
     * 根据容器实际尺寸动态计算 iframe 缩放比
     * iframe 内部始终以 1920×1080 视口渲染（不受容器大小影响），
     * 通过 CSS transform: scale() 缩放到容器尺寸，避免内部响应式布局变形
     * 使用 requestAnimationFrame 防抖，避免频繁重排
     */
    function updatePptScale() {
      // 取消之前的 RAF，合并多次调用为一次
      if (pptResizeRafId) {
        cancelAnimationFrame(pptResizeRafId);
        pptResizeRafId = null;
      }
      pptResizeRafId = requestAnimationFrame(() => {
        pptResizeRafId = null;
        const container = pptContainer.value;
        if (!container) return;
        // 获取容器实际渲染尺寸
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw <= 0 || ch <= 0) return;
        // 计算缩放比：取宽高缩放比的较小值（contain 策略），保证内容完全可见
        const scaleX = cw / pptBaseWidth.value;
        const scaleY = ch / pptBaseHeight.value;
        pptScale.value = Math.min(scaleX, scaleY);
      });
    }

    // ========================================================================
    // 3.11 PPT 全屏
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

      // 全屏切换后容器尺寸改变，延迟一帧重新计算缩放比
      nextTick(() => {
        updatePptScale();
      });
    }

    // ========================================================================
    // 3.12 B站风格控件 hover 显示/隐藏
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
    // 3.13 AI 对话
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
    // 3.14 章节状态辅助
    // ========================================================================

    /**
     * 章节状态到 UI 类型的映射
     * @param {string} status - 后端状态（pending/generating/completed/failed）
     * @returns {string} UI 状态（pending/active/completed）
     */
    function mapChapterStatus(status) {
      switch (status) {
        case "completed":
        case "partial_completed":
          return "completed"; // 已完成或部分完成，均显示为可学习状态
        case "generating":
          return "pending"; // 生成中显示为 pending
        case "failed":
          return "completed"; // 失败也显示为可点击（可能部分完成）
        default:
          return "pending";
      }
    }

    // ========================================================================
    // 3.15 生命周期
    // ========================================================================

    onMounted(async () => {
      console.log(TAG + " NERV 三栏播放器学习页初始化完成");

      // ========== PPT 容器缩放监听 ==========
      // 使用 ResizeObserver 监听 pptContainer 尺寸变化，动态更新 iframe 缩放比
      // 这样即使容器因侧边栏拖动、窗口缩放等变化，PPT 内容也能正确缩放
      if (pptContainer.value) {
        pptResizeObserver = new ResizeObserver(() => {
          updatePptScale();
        });
        pptResizeObserver.observe(pptContainer.value);
        // 首次计算缩放比
        updatePptScale();
        console.log(TAG + " PPT 缩放监听已启动，基准尺寸: " + pptBaseWidth.value + "x" + pptBaseHeight.value + "px");
      }

      // 如果有课程参数，自动加载课程数据
      if (studyParams?.value?.courseId) {
        console.log(TAG + " 检测到课程参数，自动加载: courseId=" + studyParams.value.courseId);

        // 从 localStorage 恢复自动生成开关状态
        const key = "auto_generate_" + studyParams.value.courseId;
        autoGenerateEnabled.value = localStorage.getItem(key) === "1";
        console.log(TAG + " 自动生成模式: " + (autoGenerateEnabled.value ? "已开启" : "已关闭"));

        await loadCourseData();

        // 加载完成后，检查是否有正在生成的章节，启动轮询
        const hasGenerating = chapters.value.some(c => c.status === "generating");
        if (hasGenerating) {
          console.log(TAG + " 检测到生成中章节，启动进度轮询");
          startChapterProgressPolling();
        }
      } else {
        courseLoading.value = false;
        console.warn(TAG + " 未接收到课程参数，页面为空状态");
      }
    });

    onUnmounted(async () => {
      // 清理 PPT 缩放监听
      if (pptResizeObserver) {
        pptResizeObserver.disconnect();
        pptResizeObserver = null;
        console.log(TAG + " PPT 缩放监听已清理");
      }
      // 清理 RAF 定时器
      if (pptResizeRafId) {
        cancelAnimationFrame(pptResizeRafId);
        pptResizeRafId = null;
      }

      // 停止章节进度轮询
      stopChapterProgressPolling();

      // 停止文件补全状态轮询
      stopFixStatusPolling();

      // 页面卸载前立即保存当前学习进度（不使用防抖，确保不丢失）
      if (saveProgressTimer) clearTimeout(saveProgressTimer);
      const courseId = studyParams?.value?.courseId;
      if (courseId && activeChapter.value) {
        try {
          // 计算页面关闭前的剩余学习时长
          const finalElapsed = Math.floor((Date.now() - studySessionStart) / 1000) + accumulatedStudySeconds;

          await saveProgress({
            courseId,
            chapterId: activeChapter.value,
            progress: currentPage.value,
            studyDuration: finalElapsed > 0 ? finalElapsed : undefined,
          });
          console.log(TAG + " 页面卸载，学习进度已保存，剩余时长: " + finalElapsed + "s");
        } catch (e) {
          console.warn(TAG + " 卸载时保存进度失败: " + (e?.message || e));
        }
      }

      // 清理定时器
      if (hideTimer) { clearTimeout(hideTimer); }
      // 暂停音频
      const audio = audioRef.value;
      if (audio) {
        audio.pause();
        audio.src = ""; // 释放音频资源
      }
      console.log(TAG + " 学习页已卸载");
    });

    // ========================================================================
    // 3.16 返回模板
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
      switchChapter,
      mapChapterStatus,

      // 课程信息
      courseInfo,
      courseLoading,
      chapterLoading,

      // 幻灯片
      slides,
      currentPptUrl,
      currentAudioUrl,
      currentScript, // 口播稿
      currentZjts,   // 助教提示
      pptLoading,
      onPptLoad,

      // 播放器
      isPlaying,
      isFullscreen,
      autoPlay,
      playbackSpeed,
      currentPage,
      totalPages,
      progressPercent,
      formattedTime,
      formattedTotalTime,

      // 字幕
      subtitleText,

      // 音频
      audioRef,
      onAudioTimeUpdate,
      onAudioEnded,
      onAudioLoaded,
      onAudioError,

      // 控件
      pptContainer,
      playerControls,
      showControls,
      hideControls,
      cancelHideTimer,

      // PPT 缩放渲染
      pptScale,
      pptBaseWidth,
      pptBaseHeight,

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

      // 下一章生成
      generateBtnDisabled,
      generateBtnText,
      isGeneratingChapter,
      autoGenerateEnabled,
      chapterProgressMap,
      handleGenerateNextChapter,
      onAutoGenerateToggle,
      showGeneratingTip,
      getChapterProgressLabel,
      getChapterProgressBarWidth,
      getChapterProgressCountText,

      // 文件补全
      isFixingMissing,
      fixingBannerText,
    };
  },
};
