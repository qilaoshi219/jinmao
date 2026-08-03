// ==================== 手机端刷题页业务逻辑 ====================
// 职责：题库选择（无 sessionId 时）/ 会话加载 / 题目渲染 / 作答保存 / 交卷
// 数据流：App.vue → quizParams → MobileQuizPage

import { ref, computed, reactive, watch, onUnmounted, inject } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  getRandomSessionDetail,
  saveRandomSessionProgress,
  completeRandomSession,
  getSequentialSessionDetail,
  saveSequentialSessionProgress,
  completeSequentialSession,
  listQuizTextbooks,
  startRandomSession,
  startSequentialSession,
} from "../../api/quiz";
import QuizQuestionCard from "../../components/quiz/QuizQuestionCard.vue";
import QuizAnswerSheet from "../../components/quiz/QuizAnswerSheet.vue";
import MobileQuizReport from "./report.vue";

// 日志前缀
const TAG = "[MobileQuizPage]";

export default {
  components: {
    QuizQuestionCard,
    QuizAnswerSheet,
    MobileQuizReport,
  },

  setup() {
    // ========== 导航 ==========
    const navigate = inject("navigate", () => {});
    // 返回上一页函数（从 App.vue 注入，无应用内历史时兜底回手机首页）
    const navigateBack = inject("goBack", () => navigate("mobile-home"));

    // ========== 页面参数（从 App.vue 注入）==========
    const quizParams = inject("quizParams", ref({}));

    // 报告子视图模式（交卷后或直达 /mobile/quiz/report 时渲染报告页）
    const isReportMode = computed(() => quizParams.value?.mode === "report");

    /** 是否有刷题会话（无会话时进入"选择题库"模式） */
    const hasSession = computed(() => !!quizParams.value?.sessionId);

    // 刷题模式（"random" 或 "sequential"），默认随机
    const sessionMode = computed(() => quizParams.value?.sessionMode || "random");

    // ========== 题库选择模式状态 ==========
    const textbookLoading = ref(false);
    const textbooks = ref([]);
    const startingId = ref("");

    // ========== 答题模式状态 ==========
    const loading = ref(true);
    const submitting = ref(false);
    const sessionId = computed(() => quizParams.value?.sessionId || "");
    const textbookName = ref("智能刷题");
    const totalCount = ref(0);
    const currentIndex = ref(1);
    const questions = ref([]);
    const answers = reactive({});
    const elapsedSeconds = ref(null);
    const showAnswerSheet = ref(false);

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

    // ========== 题库选择 ==========

    /** 加载我的题库列表 */
    async function loadTextbooks() {
      textbookLoading.value = true;
      try {
        const result = await listQuizTextbooks({ page: 1, pageSize: 50 });
        if (result.code === 0 && result.data) {
          textbooks.value = result.data.items || [];
        } else {
          textbooks.value = [];
        }
      } catch (error) {
        console.warn(TAG + " 题库列表加载失败: " + (error?.message || error));
        textbooks.value = [];
      } finally {
        textbookLoading.value = false;
      }
    }

    /** 开始随机刷题 */
    async function onStartRandom(textbookId) {
      if (startingId.value) return;
      startingId.value = "rnd_" + textbookId;
      try {
        const result = await startRandomSession(textbookId);
        if (result.code === 0 && result.data) {
          navigate("mobile-quiz", { sessionId: result.data.sessionId });
        } else {
          ElMessage.error(result.message || "无法开始刷题");
        }
      } catch (error) {
        ElMessage.error("开始刷题失败: " + (error?.message || "未知错误"));
      } finally {
        startingId.value = "";
      }
    }

    /** 开始顺序刷题 */
    async function onStartSequential(textbookId) {
      if (startingId.value) return;
      startingId.value = "seq_" + textbookId;
      try {
        const result = await startSequentialSession(textbookId);
        if (result.code === 0 && result.data) {
          navigate("mobile-quiz", { sessionId: result.data.sessionId, sessionMode: "sequential" });
        } else {
          ElMessage.error(result.message || "无法开始顺序刷题");
        }
      } catch (error) {
        ElMessage.error("开始刷题失败: " + (error?.message || "未知错误"));
      } finally {
        startingId.value = "";
      }
    }

    // ========== 会话加载 ==========

    /** 加载会话详情 */
    async function loadSession() {
      const sid = quizParams.value?.sessionId;
      if (!sid) return;

      console.log(TAG + " 加载会话，sessionId:", sid, ", mode:", sessionMode.value);
      loading.value = true;

      try {
        const result = sessionMode.value === "sequential"
          ? await getSequentialSessionDetail(sid)
          : await getRandomSessionDetail(sid);

        if (result.code === 0 && result.data) {
          const data = result.data;
          textbookName.value = data.textbookName || "智能刷题";
          totalCount.value = data.totalCount;
          currentIndex.value = data.currentQuestionIndex || 1;
          questions.value = data.questions || [];

          // 回填已作答数据
          Object.entries(data.answers || {}).forEach(([qid, ans]) => {
            answers[qid] = ans;
          });
          console.log(TAG + " 会话加载完成 — 题目数:", totalCount.value);
          startTimer();
        } else {
          ElMessage.error(result.message || "加载失败");
          navigate("mobile-home");
        }
      } catch (error) {
        console.error(TAG + " 加载会话异常:", error);
        ElMessage.error("加载失败: " + (error.message || "未知错误"));
        navigate("mobile-home");
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

    /** 跳转到指定题目（含自动保存） */
    async function jumpToQuestion(index) {
      if (index < 1 || index > totalCount.value) return;
      if (index === currentIndex.value) return;

      await saveProgress(currentIndex.value);
      currentIndex.value = index;
    }

    /** 答案变更 → 自动保存 */
    async function onAnswerChange(val) {
      const q = currentQuestion.value;
      if (!q) return;
      answers[q.id] = val;
      await saveProgress(currentIndex.value, q.id, val);
    }

    /** 保存进度到服务端 */
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
      }
    }

    /** 交卷 */
    async function handleSubmit() {
      const unanswered = questionStatuses.value.filter((s) => !s).length;
      if (unanswered > 0) {
        try {
          await ElMessageBox.confirm(
            "还有 " + unanswered + " 道题未作答，确定要交卷吗？",
            "确认交卷",
            { confirmButtonText: "确定交卷", cancelButtonText: "继续做题", type: "warning" }
          );
        } catch (_) {
          return;
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
          navigate("mobile-quiz", { mode: "report", reportId: result.data.reportId }, { replace: true });
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

    /** 返回上一页 */
    function goBack() {
      stopTimer();
      navigateBack();
    }

    /** 前往题库市场 */
    function goToMarket() {
      navigate("mobile-market");
    }

    // ========== 参数变化监听 ==========
    // 手机端"选择题库 → 开始刷题"在同一页面内切换，需监听 quizParams 变化
    watch(
      quizParams,
      () => {
        showAnswerSheet.value = false;
        if (isReportMode.value) return; // 报告子视图自行加载
        stopTimer();
        elapsedSeconds.value = null;
        // 清空上一会话的作答状态（同一组件实例内可能切换多个会话）
        Object.keys(answers).forEach((k) => delete answers[k]);
        questions.value = [];
        totalCount.value = 0;
        currentIndex.value = 1;
        textbookName.value = "智能刷题";
        if (quizParams.value?.sessionId) {
          loadSession();
        } else {
          loadTextbooks();
        }
      },
      { deep: true, immediate: true }
    );

    // ========== 生命周期 ==========
    onUnmounted(() => {
      stopTimer();
      console.log(TAG + " 刷题页已卸载");
    });

    // ========== 导出给模板 ==========
    return {
      // 状态
      loading,
      submitting,
      textbookLoading,
      textbooks,
      startingId,
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
      hasSession,
      // 方法
      loadTextbooks,
      onStartRandom,
      onStartSequential,
      jumpToQuestion,
      onAnswerChange,
      handleSubmit,
      goBack,
      goToMarket,
      formatTime,
    };
  },
};
