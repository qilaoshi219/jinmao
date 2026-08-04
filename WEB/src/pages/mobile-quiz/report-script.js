// ==================== 手机端刷题报告页面业务逻辑 ====================
// 职责：加载报告详情、SSE 实时判题进度、分数计算、题目解析展示

import { ref, computed, onMounted, onUnmounted, inject } from "vue";
import { getQuizReportDetail, streamQuizReport } from "../../api/quiz";

// 日志前缀
const TAG = "[MobileQuizReport]";

export default {
  setup() {
    // ========== 导航 ==========
    const navigate = inject("navigate", () => {});
    // 返回上一页函数（从 App.vue 注入，无应用内历史时兜底回手机首页）
    const navigateBack = inject("goBack", () => navigate("mobile-home"));

    // ========== 页面参数 ==========
    const quizParams = inject("quizParams", ref({}));

    // ========== 响应式数据 ==========
    const loading = ref(true);
    const report = ref(null);
    const expandedIdx = ref(-1);

    // SSE 相关
    let reader = null;

    // ========== 计算属性 ==========

    /** 答对数量 */
    const correctCount = computed(() => {
      if (!report.value?.items) return 0;
      return report.value.items.filter((item) => item.isCorrect === true).length;
    });

    /** 答错数量 */
    const wrongCount = computed(() => {
      if (!report.value?.items) return 0;
      return report.value.items.filter((item) => item.isCorrect === false).length;
    });

    /** 得分百分比 */
    const scorePercent = computed(() => {
      return Math.min(100, Math.max(0, report.value?.scoreTotal || 0));
    });

    /** 分数环颜色 */
    const scoreColorClass = computed(() => {
      const p = scorePercent.value;
      if (p >= 80) return "stroke-green-500 dark:stroke-green-400";
      if (p >= 60) return "stroke-blue-500 dark:stroke-blue-400";
      return "stroke-red-500 dark:stroke-red-400";
    });

    /** 当前展开的题目 */
    const currentItem = computed(() => {
      if (!report.value?.items || expandedIdx.value < 0) return null;
      return report.value.items[expandedIdx.value] || null;
    });

    // ========== 数据加载 ==========

    /**
     * 加载报告详情
     */
    async function loadReport() {
      const reportId = quizParams.value?.reportId;
      if (!reportId) {
        console.warn(TAG + " 报告ID缺失");
        navigate("mobile-home");
        return;
      }

      console.log(TAG + " 加载报告，reportId:", reportId);

      try {
        const result = await getQuizReportDetail(reportId);

        if (result.code === 0 && result.data) {
          report.value = result.data;
          console.log(TAG + " 报告加载完成 — 分数:", result.data.scoreTotal);

          // 如果状态是 GRADING，建立 SSE 连接
          if (result.data.status === "GRADING") {
            connectSSE(reportId);
          }
        } else {
          console.warn(TAG + " 报告加载失败:", result.message);
        }
      } catch (error) {
        console.error(TAG + " 加载报告异常:", error);
      } finally {
        loading.value = false;
      }
    }

    /**
     * 建立 SSE 连接，实时接收判题进度
     */
    function connectSSE(reportId) {
      console.log(TAG + " 建立 SSE 连接，reportId:", reportId);

      try {
        streamQuizReport(reportId).then((response) => {
          if (!response.ok) return;

          reader = response.body?.getReader();
          if (!reader) return;

          const decoder = new TextDecoder();
          let buffer = "";

          function processChunk() {
            reader.read().then(({ value, done }) => {
              if (done) return;

              buffer += decoder.decode(value, { stream: true });

              // 解析 SSE 事件
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    report.value = data;
                    console.log(TAG + " SSE 收到更新");
                  } catch (_) { /* ignore parse errors */ }
                }
              }

              processChunk();
            }).catch(() => {
              console.log(TAG + " SSE 读取结束");
            });
          }

          processChunk();
        });
      } catch (error) {
        console.warn(TAG + " SSE 连接失败:", error.message);
      }
    }

    /**
     * 返回上一页
     */
    function goBack() {
      // 清除 SSE
      if (reader) {
        reader.cancel().catch(() => {});
      }
      navigateBack();
    }

    // ========== 生命周期 ==========
    onMounted(() => {
      console.log(TAG + " 报告页已挂载");
      loadReport();
    });

    onUnmounted(() => {
      // 清理 SSE 连接
      if (reader) {
        reader.cancel().catch(() => {});
      }
      console.log(TAG + " 报告页已卸载");
    });

    // ========== 导出 ==========
    return {
      loading,
      report,
      expandedIdx,
      correctCount,
      wrongCount,
      scorePercent,
      scoreColorClass,
      currentItem,
      goBack,
    };
  },
};
