// ==================== 学习周报页面业务逻辑 ====================
// 职责：加载最近 7 天周报、计算汇总卡片与柱状图高度

import { ref, computed, inject, onMounted } from "vue";
import { getWeeklyReport } from "../../api/stats";

// 日志前缀
const TAG = "[WeeklyPage]";

export default {
  setup() {
    // ========== 导航 ==========
    const navigate = inject("navigate", () => {});
    const navigateBack = inject("goBack", () => navigate("home"));

    // ========== 状态 ==========
    const loading = ref(true);
    const report = ref(null);

    // ========== 计算属性 ==========

    /** 汇总卡片（本周数据） */
    const summaryCards = computed(() => {
      const s = report.value?.summary;
      if (!s) return [];
      return [
        { label: "本周学习时长", value: formatMin(s.studySeconds) },
        { label: "本周刷题", value: s.quizCount + " 题" },
        { label: "本周正确率", value: (s.quizCount > 0 ? s.accuracy + "%" : "--") },
        { label: "活跃天数", value: s.activeDays + " 天" },
        { label: "完成章节", value: s.completedChapters + " 章" },
      ];
    });

    // ========== 数据加载 ==========
    async function loadWeekly() {
      loading.value = true;
      try {
        const result = await getWeeklyReport();
        if (result.code === 200 && result.data) {
          report.value = result.data;
          console.log(TAG + " 周报加载成功");
        }
      } catch (error) {
        console.error(TAG + " 周报加载异常: " + (error?.message || error));
      } finally {
        loading.value = false;
      }
    }

    /** 柱状图高度：按 7 天最大值归一化到 100px，最小 4px */
    function barHeight(seconds) {
      if (!seconds || seconds <= 0) return 4;
      const max = Math.max(...report.value.days.map((d) => d.studySeconds), 1);
      return Math.max(4, Math.round((seconds / max) * 100));
    }

    /** 秒 → 分钟（不足 1 分钟显示 "X 秒"） */
    function formatMin(seconds) {
      if (!seconds || seconds <= 0) return "0 分";
      if (seconds < 60) return seconds + " 秒";
      const m = Math.floor(seconds / 60);
      return m + " 分";
    }

    function goBack() {
      navigateBack();
    }

    // ========== 生命周期 ==========
    onMounted(() => {
      console.log(TAG + " 周报页已挂载");
      loadWeekly();
    });

    return {
      loading,
      report,
      summaryCards,
      loadWeekly,
      barHeight,
      formatMin,
      goBack,
    };
  },
};
