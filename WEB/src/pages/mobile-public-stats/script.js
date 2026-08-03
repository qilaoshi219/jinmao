// ==================== 手机端公开考试数据页（所有者）业务逻辑 ====================
// 职责：展示参与人数、完成数、平均正确率、每题正确率、考生明细

import { ref, computed, inject, onMounted } from "vue";
import { ElMessage } from "element-plus";
import QRCode from "qrcode";
import { getExamStats, setExamStatus } from "../../api/public-exam";

// 日志前缀
const TAG = "[MobilePublicStatsPage]";

export default {
  setup() {
    // ========== 导航 ==========
    const navigate = inject("navigate", () => {});
    const navigateBack = inject("goBack", () => navigate("mobile-home"));

    // 路由参数（App.vue 注入）
    const publicStatsParams = inject("publicStatsParams", ref(null));

    // ========== 响应式数据 ==========
    const loading = ref(true);
    const stats = ref(null);
    const page = ref(1);
    const pageSize = 20;
    const toggling = ref(false);
    const qrDialogVisible = ref(false);
    const qrDataUrl = ref("");

    // ========== 数据加载 ==========

    function token() {
      return publicStatsParams.value?.token || "";
    }

    /** 考试公开链接 */
    const examLink = computed(() => window.location.origin + "/p/" + token());

    async function loadStats() {
      if (!token()) {
        ElMessage.error("缺少考试标识");
        navigate("mobile-home");
        return;
      }

      loading.value = true;
      try {
        const result = await getExamStats(token(), { page: page.value, pageSize });
        if (result.code === 0 && result.data) {
          stats.value = result.data;
        } else {
          ElMessage.error(result.message || "加载统计数据失败");
          navigate("mobile-home");
        }
      } catch (error) {
        console.error(TAG + " 加载统计数据异常:", error);
        ElMessage.error("加载统计数据失败: " + (error.message || "未知错误"));
      } finally {
        loading.value = false;
      }
    }

    /** 分页切换 */
    function onPageChange(p) {
      page.value = p;
      loadStats();
    }

    /** 复制考试链接 */
    async function copyLink() {
      const url = examLink.value;
      try {
        await navigator.clipboard.writeText(url);
        ElMessage.success("链接已复制，可直接发送给考生");
      } catch (_) {
        ElMessage.warning("复制失败，请手动复制地址栏链接");
      }
    }

    /** 打开二维码弹窗（每次打开重新生成） */
    async function openQr() {
      qrDataUrl.value = "";
      qrDialogVisible.value = true;
      try {
        qrDataUrl.value = await QRCode.toDataURL(examLink.value, {
          width: 360,
          margin: 1,
        });
      } catch (error) {
        console.error(TAG + " 生成二维码失败:", error);
        ElMessage.error("生成二维码失败");
      }
    }

    /** 停止/恢复考试 */
    async function toggleStatus() {
      if (toggling.value) return;
      toggling.value = true;
      try {
        const next = stats.value.status === "published" ? "closed" : "published";
        const result = await setExamStatus(token(), next);
        if (result.code === 0) {
          stats.value.status = result.data.status;
          ElMessage.success(result.data.status === "closed" ? "考试已停止" : "考试已恢复");
        } else {
          ElMessage.error(result.message || "操作失败");
        }
      } catch (error) {
        ElMessage.error("操作失败: " + (error.message || "未知错误"));
      } finally {
        toggling.value = false;
      }
    }

    /** 格式化用时 */
    function formatDuration(seconds) {
      const s = Math.max(0, seconds || 0);
      const m = Math.floor(s / 60);
      const left = s % 60;
      if (m <= 0) return left + "秒";
      return m + "分" + left + "秒";
    }

    onMounted(() => {
      console.log(TAG + " 考试数据页已挂载");
      loadStats();
    });

    return {
      loading,
      stats,
      page,
      pageSize,
      toggling,
      loadStats,
      onPageChange,
      copyLink,
      examLink,
      qrDialogVisible,
      qrDataUrl,
      openQr,
      toggleStatus,
      formatDuration,
      navigateBack,
    };
  },
};
