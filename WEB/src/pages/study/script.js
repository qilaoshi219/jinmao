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

import { ref, computed, watch, onMounted, onUnmounted, inject, nextTick } from "vue";
import { ElMessage } from "element-plus";
import { useTheme } from "../../composables/useTheme";
import { useResize } from "../../composables/useResize";
import { getBookDetail, getChapterSlides } from "../../api/books";

// ============================================================================
// 一、常量定义
// ============================================================================

/** 控制台日志前缀 */
const TAG = "[StudyPage]";

/** 每页展示时长（秒），仅在没有音频文件时作为 fallback 使用 */
const FALLBACK_PAGE_DURATION = 30;

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

    // ---- 控件显示 ----
    let hideTimer = null;

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

    // ---- DOM 引用 ----
    const pptContainer = ref(null);
    const playerControls = ref(null);
    const audioRef = ref(null);

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

          // 自动选中第一个已完成状态的章节
          if (chapters.value.length > 0) {
            const firstCompleted = chapters.value.find((c) => c.status === "completed");
            const targetChapter = firstCompleted || chapters.value[0];
            activeChapter.value = targetChapter.id;
            // 自动加载该章节的幻灯片
            await loadChapterSlides(targetChapter.id);
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
          prefetchChapterTotalTime();

          // 重置 PPT iframe 加载状态
          pptLoading.value = true;
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
      if (chapterId === activeChapter.value) return; // 已经是当前章节，不重复加载
      console.log(TAG + " 切换章节: " + chapterId);
      activeChapter.value = chapterId;
      await loadChapterSlides(chapterId);
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

      // 更新页码
      currentPage.value = page;
      currentTime.value = 0;
      progressPercent.value = 0;
      pptLoading.value = true;

      // 如果是后退，重新计算已播放累计时长（前进时由 onAudioEnded 负责累加）
      if (page < currentPage.value) {
        let sum = 0;
        for (let i = 0; i < page - 1; i++) {
          sum += (slides.value[i]?._duration || 0);
        }
        chapterElapsedTime.value = sum;
      }

      // 等待 Vue 响应式更新后加载新字幕
      await nextTick();
      await loadCurrentSrt();

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
          return "completed";
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

      // 如果有课程参数，自动加载课程数据
      if (studyParams?.value?.courseId) {
        console.log(TAG + " 检测到课程参数，自动加载: courseId=" + studyParams.value.courseId);
        await loadCourseData();
      } else {
        courseLoading.value = false;
        console.warn(TAG + " 未接收到课程参数，页面为空状态");
      }
    });

    onUnmounted(() => {
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
