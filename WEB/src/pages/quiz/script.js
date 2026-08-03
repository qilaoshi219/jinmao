// ==================== 刷题页面业务逻辑 ====================
// 职责：会话加载、题目渲染、作答保存、交卷
// 数据流：App.vue → quizParams → QuizPage

import { ref, reactive, computed, onMounted, onUnmounted, inject } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  getRandomSessionDetail,
  saveRandomSessionProgress,
  completeRandomSession,
  getSequentialSessionDetail,
  saveSequentialSessionProgress,
  completeSequentialSession,
} from "../../api/quiz";

// 导入子组件
import QuizQuestionCard from "../../components/quiz/QuizQuestionCard.vue";
import QuizAnswerSheet from "../../components/quiz/QuizAnswerSheet.vue";
import QuizReport from "./report.vue";

// 日志前缀
const TAG = "[QuizPage]";

// ==================== 导出 setup ====================
export default {
  components: {
    QuizQuestionCard,
    QuizAnswerSheet,
    QuizReport,
  },

  setup() {
    // ========== 导航 ==========
    const navigate = inject("navigate", () => {});
    // 返回上一页函数（从 App.vue 注入，无应用内历史时兜底回首页）
    const navigateBack = inject("goBack", () => navigate("home"));

    // ========== 页面参数（从 App.vue 注入）==========
    const quizParams = inject("quizParams", ref({}));

    // 报告子视图模式（交卷后或直达 /quiz/report 时渲染报告页）
    const isReportMode = computed(() => quizParams.value?.mode === "report");

    // ========== 响应式数据 ==========
    const loading = ref(true);
    const submitting = ref(false);
    const sessionId = ref("");
    const textbookName = ref("智能刷题");
    const totalCount = ref(0);
    const currentIndex = ref(1);
    const questions = ref([]);
    const answers = reactive({});
    const elapsedSeconds = ref(null);
    const showAnswerSheet = ref(false);

    // 刷题模式（"random" 或 "sequential"），默认随机
    const sessionMode = computed(() => quizParams.value?.sessionMode || "random");

    // 计时器
    let timerInterval = null;

    // ========== 计算属性 ==========

    /** 当前题目 */
    const currentQuestion = computed(() => {
      return questions.value[currentIndex.value - 1] || null;
    });

    /** 当前答案 */
    const currentAnswer = computed(() => {
      const q = currentQuestion.value;
      if (!q) return null;
      return answers[q.id] || null;
    });

    /** 题目状态数组（答题卡用） */
    const questionStatuses = computed(() => {
      return questions.value.map((q) => {
        const ans = answers[q.id];
        if (q.type === "essay" || q.type === "fill") {
          return ans && String(ans).trim() ? "answered" : null;
        }
        return ans !== undefined && ans !== null ? "answered" : null;
      });
    });

    // ========== 数据加载 ==========

    /**
     * 加载会话详情
     */
    async function loadSession() {
      // 报告子视图：由 QuizReport 组件渲染，无需加载会话
      if (isReportMode.value) return;

      const sid = quizParams.value?.sessionId;
      if (!sid) {
        ElMessage.error("会话ID缺失");
        navigate("home");
        return;
      }

      console.log(TAG + " 加载会话，sessionId:", sid, ", mode:", sessionMode.value);

      try {
        const result = sessionMode.value === "sequential"
          ? await getSequentialSessionDetail(sid)
          : await getRandomSessionDetail(sid);

        if (result.code === 0 && result.data) {
          const data = result.data;
          sessionId.value = sid;
          textbookName.value = data.textbookName || "智能刷题";
          totalCount.value = data.totalCount;
          currentIndex.value = data.currentQuestionIndex || 1;
          questions.value = data.questions || [];

          // 回填已作答数据
          Object.entries(data.answers || {}).forEach(([qid, ans]) => {
            answers[qid] = ans;
          });

          console.log(TAG + " 会话加载完成 — 题目数:", totalCount.value, ", 已答:", Object.keys(data.answers || {}).length);
          startTimer();
        } else {
          ElMessage.error(result.message || "加载失败");
          navigate("home");
        }
      } catch (error) {
        console.error(TAG + " 加载会话异常:", error);
        ElMessage.error("加载失败: " + (error.message || "未知错误"));
        navigate("home");
      } finally {
        loading.value = false;
      }
    }

    // ========== 计时器 ==========

    function startTimer() {
      stopTimer();
      const startTime = Date.now();
      timerInterval = setInterval(() => {
        elapsedSeconds.value = Math.floor((Date.now() - startTime) / 1000);
      }, 1000);
    }

    function stopTimer() {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }

    /** 格式化秒数为 mm:ss */
    function formatTime(seconds) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }

    // ========== 事件处理 ==========

    /**
     * 跳转到指定题目（含自动保存）
     */
    async function jumpToQuestion(index) {
      if (index < 1 || index > totalCount.value) return;
      if (index === currentIndex.value) return;

      // 先保存进度
      await saveProgress(currentIndex.value);

      currentIndex.value = index;
      console.log(TAG + " 跳转到第 " + index + " 题");
    }

    /**
     * 答案变更 → 自动保存
     */
    async function onAnswerChange(val) {
      const q = currentQuestion.value;
      if (!q) return;

      answers[q.id] = val;
      await saveProgress(currentIndex.value, q.id, val);
    }

    /**
     * 保存进度到服务端
     */
    async function saveProgress(currentIdx, questionId, answer) {
      try {
        const saveFn = sessionMode.value === "sequential"
          ? saveSequentialSessionProgress
          : saveRandomSessionProgress;
        await saveFn(sessionId.value, {
          currentQuestionIndex: currentIdx,
          questionId: questionId || undefined,
          answer: answer !== undefined ? answer : undefined,
        });
      } catch (error) {
        console.warn(TAG + " 保存进度失败:", error.message);
        // 静默失败，不影响用户操作
      }
    }

    /**
     * 交卷
     */
    async function handleSubmit() {
      // 确认是否有未答题目
      const unanswered = questionStatuses.value.filter((s) => !s).length;
      if (unanswered > 0) {
        try {
          await ElMessageBox.confirm(
            "还有 " + unanswered + " 道题未作答，确定要交卷吗？",
            "确认交卷",
            { confirmButtonText: "确定交卷", cancelButtonText: "继续做题", type: "warning" }
          );
        } catch (_) {
          return; // 取消
        }
      }

      submitting.value = true;

      try {
        const completeFn = sessionMode.value === "sequential"
          ? completeSequentialSession
          : completeRandomSession;
        const result = await completeFn(sessionId.value);

        if (result.code === 0) {
          stopTimer();
          ElMessage.success("交卷成功！");
          // 跳转到报告页（replaceState：报告页覆盖当前会话，浏览器返回不会回到已交卷的会话）
          navigate("quiz", { mode: "report", reportId: result.data.reportId }, { replace: true });
        } else {
          ElMessage.error(result.message || "交卷失败");
        }
      } catch (error) {
        console.error(TAG + " 交卷异常:", error);
        ElMessage.error("交卷失败: " + (error.message || "未知错误"));
      } finally {
        submitting.value = false;
      }
    }

    /**
     * 返回上一页
     */
    function goBack() {
      stopTimer();
      navigateBack();
    }

    // ========== 生命周期 ==========
    onMounted(() => {
      console.log(TAG + " 刷题页已挂载");
      loadSession();
    });

    onUnmounted(() => {
      stopTimer();
      console.log(TAG + " 刷题页已卸载");
    });

    // ========== 导出给模板 ==========
    return {
      // 状态
      loading,
      submitting,
      textbookName,
      totalCount,
      currentIndex,
      questions,
      answers,
      elapsedSeconds,
      showAnswerSheet,

      // 计算属性
      currentQuestion,
      currentAnswer,
      questionStatuses,
      isReportMode,

      // 方法
      jumpToQuestion,
      onAnswerChange,
      handleSubmit,
      goBack,
      formatTime,
    };
  },
};
