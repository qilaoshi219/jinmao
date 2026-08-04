// ==================== 思维导图页面业务逻辑 ====================
// 职责：加载课程思维导图数据、计算 SVG 树状布局（课程 → 章节 → 要点）

import { ref, computed, inject, onMounted } from "vue";
import { getCourseMindMap } from "../../api/books";

// 日志前缀
const TAG = "[MindMapPage]";

// 布局常量
const ROW_H = 46; // 每个要点占行高
const PADDING_Y = 40; // 上下内边距

export default {
  setup() {
    // ========== 导航与参数 ==========
    const navigate = inject("navigate", () => {});
    const navigateBack = inject("goBack", () => navigate("home"));
    const studyParams = inject("studyParams", ref({}));

    // ========== 状态 ==========
    const loading = ref(true);
    const error = ref("");
    const data = ref(null);

    // ========== 计算布局 ==========
    const layout = computed(() => {
      const chapters = (data.value?.chapters || []).map((ch) => {
        const slides = ch.slides || [];
        return { ...ch, slides };
      });
      const totalRows = chapters.reduce((sum, ch) => sum + Math.max(ch.slides.length, 1), 0);
      const totalHeight = totalRows * ROW_H + PADDING_Y * 2;

      let cursor = PADDING_Y;
      const positioned = chapters.map((ch) => {
        const rows = Math.max(ch.slides.length, 1);
        const y = cursor + (rows * ROW_H) / 2;
        const slides = ch.slides.map((s, i) => ({ ...s, y: cursor + i * ROW_H + ROW_H / 2 }));
        cursor += rows * ROW_H;
        return { ...ch, y, slides };
      });

      return { chapters: positioned, courseY: totalHeight / 2, totalHeight };
    });

    const svgHeight = computed(() => Math.max(200, layout.value.totalHeight));

    // ========== 数据加载 ==========
    async function loadMindMap() {
      const courseId = studyParams.value?.courseId;
      if (!courseId) {
        error.value = "缺少课程参数";
        loading.value = false;
        return;
      }
      loading.value = true;
      error.value = "";
      try {
        const result = await getCourseMindMap(courseId);
        if (result.code === 200 && result.data) {
          data.value = result.data;
          console.log(TAG + " 思维导图加载成功");
        } else {
          error.value = result.message || "思维导图加载失败";
        }
      } catch (e) {
        error.value = e?.response?.data?.message || e?.message || "思维导图加载失败";
      } finally {
        loading.value = false;
      }
    }

    /** 截断长文本 */
    function truncate(text, max) {
      const s = String(text || "");
      return s.length > max ? s.slice(0, max) + "…" : s;
    }

    function goBack() {
      navigateBack();
    }

    // ========== 生命周期 ==========
    onMounted(() => {
      console.log(TAG + " 思维导图页已挂载");
      loadMindMap();
    });

    return {
      loading,
      error,
      data,
      layout,
      svgHeight,
      loadMindMap,
      truncate,
      goBack,
    };
  },
};
