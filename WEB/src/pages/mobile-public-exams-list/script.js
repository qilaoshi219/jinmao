// ==================== 手机端选择考试页（我的公开考试列表）业务逻辑 ====================
// 职责：展示当前用户发布的所有公开考试，点击进入对应考试数据页

import { ref, inject, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { listMyPublicExams } from "../../api/public-exam";

// 日志前缀
const TAG = "[MobilePublicExamsListPage]";

export default {
  setup() {
    // ========== 导航 ==========
    const navigate = inject("navigate", () => {});
    const navigateBack = inject("goBack", () => navigate("mobile-home"));

    // ========== 响应式数据 ==========
    const loading = ref(true);
    const items = ref([]);
    const total = ref(0);
    const page = ref(1);
    const pageSize = 20;

    // ========== 数据加载 ==========

    async function loadList() {
      loading.value = true;
      try {
        const result = await listMyPublicExams({ page: page.value, pageSize });
        if (result.code === 0 && result.data) {
          items.value = result.data.items || [];
          total.value = result.data.total || 0;
        } else {
          ElMessage.error(result.message || "加载考试列表失败");
        }
      } catch (error) {
        console.error(TAG + " 加载考试列表异常:", error);
        ElMessage.error("加载考试列表失败: " + (error.message || "未知错误"));
      } finally {
        loading.value = false;
      }
    }

    /** 分页切换 */
    function onPageChange(p) {
      page.value = p;
      loadList();
    }

    /** 进入指定考试的统计页 */
    function enterStats(item) {
      navigate("mobile-public-stats", { token: item.token });
    }

    onMounted(() => {
      loadList();
    });

    return {
      loading,
      items,
      total,
      page,
      pageSize,
      onPageChange,
      enterStats,
      navigateBack,
    };
  },
};
