// ==================== 我的收藏页面业务逻辑 ====================
// 职责：分页加载收藏列表、进入学习、取消收藏

import { ref, inject, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { getFavorites, removeFavorite } from "../../api/books";

// 日志前缀
const TAG = "[FavoritesPage]";

export default {
  setup() {
    // ========== 导航 ==========
    const navigate = inject("navigate", () => {});
    const navigateBack = inject("goBack", () => navigate("home"));

    // ========== 状态 ==========
    const loading = ref(true);
    const list = ref([]);
    const total = ref(0);
    const currentPage = ref(1);
    const pageSize = ref(10);
    const removingId = ref(null);

    // ========== 数据加载 ==========
    async function loadFavorites() {
      loading.value = true;
      try {
        const result = await getFavorites({ page: currentPage.value, pageSize: pageSize.value });
        if (result.code === 200 && result.data) {
          list.value = result.data.list || [];
          total.value = result.data.total || 0;
        } else {
          list.value = [];
        }
      } catch (error) {
        console.error(TAG + " 收藏列表加载异常: " + (error?.message || error));
        list.value = [];
      } finally {
        loading.value = false;
      }
    }

    // ========== 交互 ==========
    function onPageChange(page) {
      currentPage.value = page;
      loadFavorites();
    }

    function openCourse(courseId) {
      navigate("study", { courseId: String(courseId) });
    }

    async function remove(item) {
      removingId.value = item.id;
      try {
        const result = await removeFavorite(item.id);
        if (result.code === 200) {
          ElMessage.success("已取消收藏");
          // 当前页删空且不是第一页时回退一页
          if (list.value.length === 1 && currentPage.value > 1) {
            currentPage.value -= 1;
          }
          loadFavorites();
        } else {
          ElMessage.error(result.message || "取消收藏失败");
        }
      } catch (error) {
        ElMessage.error(error?.response?.data?.message || "取消收藏失败");
      } finally {
        removingId.value = null;
      }
    }

    function statusType(status) {
      const map = { completed: "success", partial_completed: "success", processing: "warning", failed: "danger" };
      return map[status] || "info";
    }

    function statusLabel(status) {
      const map = { completed: "已完成", partial_completed: "已完成", processing: "生成中", failed: "生成失败" };
      return map[status] || "未知";
    }

    function goBack() {
      navigateBack();
    }

    function goHome() {
      navigate("home");
    }

    // ========== 生命周期 ==========
    onMounted(() => {
      console.log(TAG + " 收藏页已挂载");
      loadFavorites();
    });

    return {
      loading,
      list,
      total,
      currentPage,
      pageSize,
      removingId,
      onPageChange,
      openCourse,
      remove,
      statusType,
      statusLabel,
      goBack,
      goHome,
    };
  },
};
