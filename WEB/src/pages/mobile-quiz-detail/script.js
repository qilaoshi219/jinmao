// ==================== 手机端题库详情页业务逻辑 ====================
// 职责：加载题库详情、统计、试卷列表；开始顺序/随机刷题；错题本；删除试卷；公开考试管理
// 数据流：App.vue → quizDetailParams → MobileQuizDetailPage
// 说明：文本导入（上传题库）仅保留桌面端，手机端不做导入

import { ref, computed, onMounted, inject } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  getQuizTextbookDetail,
  getTextbookStats,
  startExamSequentialSession,
  startExamRandomSession,
  startWrongbookReviewSession,
  deleteExam,
} from "../../api/quiz";
import PublicExamDialog from "../../components/PublicExamDialog.vue";

// 日志前缀
const TAG = "[MobileQuizDetailPage]";

export default {
  components: { PublicExamDialog },

  setup() {
    // ========== 导航（从 App.vue 注入）==========
    const navigate = inject("navigate", () => {});
    const navigateBack = inject("goBack", () => navigate("mobile-home"));

    // ========== 路由参数（从 App.vue inject）==========
    const quizDetailParams = inject("quizDetailParams", ref(null));

    // ========== 响应式数据 ==========
    const loading = ref(true);
    const textbook = ref({
      id: "",
      name: "",
      description: "",
      totalQuestions: 0,
      totalExams: 0,
      isShared: false,
      ownType: "own",
      creatorNickname: null,
    });
    const exams = ref([]);
    const stats = ref({
      totalQuestions: 0,
      doneCount: 0,
      correctCount: 0,
      accuracy: 0,
      wrongCount: 0,
    });
    const wrongbookLoading = ref(false);
    const loadingExamId = ref(null);
    const deletingExamId = ref(null);
    const publicExamDialogVisible = ref(false);
    const publishExamId = ref("");

    // ========== 计算属性 ==========
    const CIRCUMFERENCE = 2 * Math.PI * 42;

    /** 环形图 stroke-dasharray（已完成 / 剩余） */
    const ringDashArray = computed(() => {
      const acc = stats.value.accuracy || 0;
      const done = (acc / 100) * CIRCUMFERENCE;
      const remaining = CIRCUMFERENCE - done;
      return done + " " + remaining;
    });

    /** 已做题数百分比 */
    const donePercent = computed(() => {
      const total = stats.value.totalQuestions;
      if (total <= 0) return 0;
      return Math.round((stats.value.doneCount / total) * 100);
    });

    // ========== 数据加载 ==========

    async function loadTextbookDetail() {
      const textbookId = quizDetailParams.value?.textbookId;
      if (!textbookId) {
        console.error(TAG + " 缺少 textbookId 参数");
        ElMessage.error("参数错误，无法加载题库详情");
        navigate("mobile-home");
        return;
      }

      try {
        const result = await getQuizTextbookDetail(textbookId);
        if (result.code === 0 && result.data) {
          const data = result.data;
          textbook.value = {
            id: data.id,
            name: data.name,
            description: data.description || "",
            totalQuestions: data.totalQuestions || 0,
            totalExams: data.totalExams || 0,
            isShared: data.isShared || false,
            ownType: data.ownType || "own",
            creatorNickname: data.creatorNickname || null,
          };
          exams.value = data.exams || [];
        } else {
          ElMessage.error(result.message || "加载题库详情失败");
          navigate("mobile-home");
        }
      } catch (error) {
        console.error(TAG + " 加载题库详情异常: " + (error?.message || error));
        ElMessage.error("加载题库详情失败");
      }
    }

    async function loadStats() {
      const textbookId = quizDetailParams.value?.textbookId;
      if (!textbookId) return;
      try {
        const result = await getTextbookStats(textbookId);
        if (result.code === 0 && result.data) {
          stats.value = result.data;
        }
      } catch (error) {
        console.warn(TAG + " 统计加载失败: " + (error?.message || error));
      }
    }

    // ========== 事件处理 ==========

    function goBack() {
      navigateBack();
    }

    /** 进入错题本复习 */
    async function handleWrongbook() {
      if (wrongbookLoading.value) return;
      wrongbookLoading.value = true;
      try {
        const result = await startWrongbookReviewSession(textbook.value.id);
        if (result.code === 0 && result.data) {
          navigate("mobile-quiz", { sessionId: result.data.sessionId, sessionMode: "review" });
        } else {
          ElMessage.error(result.message || "无法开始错题复习");
        }
      } catch (error) {
        ElMessage.error("错题复习失败: " + (error?.message || "未知错误"));
      } finally {
        wrongbookLoading.value = false;
      }
    }

    /** 基于试卷开始顺序刷题 */
    async function handleSequentialQuiz(examId) {
      if (loadingExamId.value) return;
      const key = examId + "_seq";
      loadingExamId.value = key;
      try {
        const result = await startExamSequentialSession(examId);
        if (result.code === 0 && result.data) {
          navigate("mobile-quiz", { sessionId: result.data.sessionId, sessionMode: "sequential" });
        } else {
          ElMessage.error(result.message || "无法开始顺序刷题");
        }
      } catch (error) {
        ElMessage.error("开始刷题失败: " + (error?.message || "未知错误"));
      } finally {
        loadingExamId.value = null;
      }
    }

    /** 基于试卷开始随机刷题 */
    async function handleRandomQuiz(examId) {
      if (loadingExamId.value) return;
      const key = examId + "_rnd";
      loadingExamId.value = key;
      try {
        const result = await startExamRandomSession(examId);
        if (result.code === 0 && result.data) {
          navigate("mobile-quiz", { sessionId: result.data.sessionId });
        } else {
          ElMessage.error(result.message || "无法开始随机刷题");
        }
      } catch (error) {
        ElMessage.error("开始刷题失败: " + (error?.message || "未知错误"));
      } finally {
        loadingExamId.value = null;
      }
    }

    /** 删除单个试卷 */
    async function handleDeleteExam(exam) {
      if (deletingExamId.value) return;
      try {
        await ElMessageBox.confirm(
          "确定要删除试卷「" + exam.name + "」及其所有题目和答题数据吗？此操作不可撤销。",
          "确认删除试卷",
          { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }
        );
      } catch (_) {
        return;
      }

      deletingExamId.value = exam.id;
      try {
        const result = await deleteExam(exam.id);
        if (result.code === 0) {
          if (result.data?.deletedTextbook) {
            ElMessage.success("试卷及题库已删除（题库下无剩余试卷）");
            navigate("mobile-home");
          } else {
            ElMessage.success("试卷已删除");
            await loadTextbookDetail();
            await loadStats();
          }
        } else {
          ElMessage.error(result.message || "删除试卷失败");
        }
      } catch (error) {
        ElMessage.error("删除试卷失败: " + (error?.message || "未知错误"));
      } finally {
        deletingExamId.value = null;
      }
    }

    /** 试卷行三点菜单分发 */
    function handleExamMenu(command, exam) {
      if (command === "publish") {
        publishExamId.value = exam.id;
        publicExamDialogVisible.value = true;
      } else if (command === "stats") {
        navigate("mobile-public-exams-list");
      }
    }

    /** 弹窗内跳转考试数据页 */
    function handleViewStats(token) {
      navigate("mobile-public-stats", { token });
    }

    // ========== 生命周期 ==========
    onMounted(async () => {
      await loadTextbookDetail();
      await loadStats();
      loading.value = false;
    });

    // ========== 导出给模板使用 ==========
    return {
      loading,
      textbook,
      exams,
      stats,
      wrongbookLoading,
      loadingExamId,
      deletingExamId,
      ringDashArray,
      donePercent,
      goBack,
      handleWrongbook,
      handleSequentialQuiz,
      handleRandomQuiz,
      handleDeleteExam,
      publicExamDialogVisible,
      publishExamId,
      handleExamMenu,
      handleViewStats,
    };
  },
};
