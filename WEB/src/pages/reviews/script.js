// ==================== 记忆曲线复习页面业务逻辑 ====================
// 职责：加载到期错题清单、一键开始错题复习会话

import { ref, inject, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { getDueReviews, startWrongbookReviewSession } from "../../api/quiz";

// 日志前缀
const TAG = "[ReviewsPage]";

export default {
  setup() {
    // ========== 导航 ==========
    const navigate = inject("navigate", () => {});
    const navigateBack = inject("goBack", () => navigate("home"));

    // ========== 状态 ==========
    const loading = ref(true);
    const data = ref(null);
    const startingId = ref(null);

    // ========== 数据加载 ==========
    async function loadDueReviews() {
      loading.value = true;
      try {
        const result = await getDueReviews();
        if (result.code === 0 && result.data) {
          data.value = result.data;
          console.log(TAG + " 复习清单加载成功，到期: " + result.data.dueCount);
        } else {
          data.value = null;
        }
      } catch (error) {
        console.error(TAG + " 复习清单加载异常: " + (error?.message || error));
        data.value = null;
      } finally {
        loading.value = false;
      }
    }

    // ========== 开始复习 ==========
    async function startReview(textbookId) {
      startingId.value = textbookId;
      try {
        const result = await startWrongbookReviewSession(textbookId);
        if (result.code === 0 && result.data?.sessionId) {
          navigate("quiz", { sessionId: result.data.sessionId });
        } else {
          ElMessage.error(result.message || "无法开始复习");
        }
      } catch (error) {
        ElMessage.error(error?.response?.data?.message || "无法开始复习");
      } finally {
        startingId.value = null;
      }
    }

    function typeLabel(type) {
      return { SINGLE: "单选", MULTIPLE: "多选", JUDGE: "判断", FILL: "填空", ESSAY: "简答" }[type] || type;
    }

    function goBack() {
      navigateBack();
    }

    // ========== 生命周期 ==========
    onMounted(() => {
      console.log(TAG + " 记忆曲线页已挂载");
      loadDueReviews();
    });

    return {
      loading,
      data,
      startingId,
      loadDueReviews,
      startReview,
      typeLabel,
      goBack,
    };
  },
};
