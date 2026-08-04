// ==================== 排行榜页面业务逻辑 ====================
// 职责：切换排行类型/窗口、加载 Top 20 排行数据、格式化展示

import { ref, inject, onMounted } from "vue";
import { getLeaderboard } from "../../api/stats";

// 日志前缀
const TAG = "[LeaderboardPage]";

export default {
  setup() {
    // ========== 导航 ==========
    const navigate = inject("navigate", () => {});
    const navigateBack = inject("goBack", () => navigate("home"));

    // ========== 状态 ==========
    const typeOptions = [
      { value: "study", label: "学习时长" },
      { value: "quiz", label: "刷题量" },
    ];
    const dayOptions = [
      { value: 7, label: "近7天" },
      { value: 30, label: "近30天" },
    ];
    const activeType = ref("study");
    const activeDays = ref(7);
    const loading = ref(false);
    const list = ref([]);

    // ========== 数据加载 ==========
    async function loadLeaderboard() {
      loading.value = true;
      try {
        const result = await getLeaderboard({ type: activeType.value, days: activeDays.value });
        if (result.code === 200 && Array.isArray(result.data)) {
          list.value = result.data;
          console.log(TAG + " 排行榜加载成功: " + list.value.length + " 条");
        } else {
          list.value = [];
        }
      } catch (error) {
        console.error(TAG + " 排行榜加载异常: " + (error?.message || error));
        list.value = [];
      } finally {
        loading.value = false;
      }
    }

    // ========== 交互 ==========
    function switchType(type) {
      if (activeType.value === type) return;
      activeType.value = type;
      loadLeaderboard();
    }

    function switchDays(days) {
      if (activeDays.value === days) return;
      activeDays.value = days;
      loadLeaderboard();
    }

    function goBack() {
      navigateBack();
    }

    /** 格式化学习时长（秒 → 可读字符串） */
    function formatDuration(totalSeconds) {
      if (!totalSeconds || totalSeconds <= 0) return "0 秒";
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      if (hours > 0) return hours + " 小时" + (minutes > 0 ? " " + minutes + " 分" : "");
      if (minutes > 0) return minutes + " 分钟";
      return totalSeconds + " 秒";
    }

    // ========== 生命周期 ==========
    onMounted(() => {
      console.log(TAG + " 排行榜页已挂载");
      loadLeaderboard();
    });

    return {
      typeOptions,
      dayOptions,
      activeType,
      activeDays,
      loading,
      list,
      switchType,
      switchDays,
      goBack,
      formatDuration,
    };
  },
};
