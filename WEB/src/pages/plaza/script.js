// ==================== 公开课广场页面业务逻辑 ====================
// 职责：广场列表搜索/分页、借阅/取消借阅；我的公开课发布管理与借阅

import { ref, reactive, inject, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { getCourseMarket, getCourseMarketMine, borrowCourse, unborrowCourse, publishCourse } from "../../api/books";

// 日志前缀
const TAG = "[PlazaPage]";

export default {
  setup() {
    // ========== 导航 ==========
    const navigate = inject("navigate", () => {});
    const navigateBack = inject("goBack", () => navigate("home"));

    // ========== 状态 ==========
    const tabs = [
      { value: "market", label: "广场" },
      { value: "mine", label: "我的" },
    ];
    const activeTab = ref("market");
    const keyword = ref("");
    const marketLoading = ref(false);
    const mineLoading = ref(false);
    const marketList = ref([]);
    const marketTotal = ref(0);
    const currentPage = ref(1);
    const pageSize = ref(10);
    const mine = reactive({ published: [], borrowed: [] });
    const actingId = ref(null);

    // ========== 广场 ==========
    async function loadMarket() {
      marketLoading.value = true;
      try {
        const result = await getCourseMarket({
          page: currentPage.value,
          pageSize: pageSize.value,
          keyword: keyword.value || undefined,
        });
        if (result.code === 200 && result.data) {
          marketList.value = result.data.list || [];
          marketTotal.value = result.data.total || 0;
        }
      } catch (error) {
        console.error(TAG + " 广场加载异常: " + (error?.message || error));
      } finally {
        marketLoading.value = false;
      }
    }

    // ========== 我的 ==========
    async function loadMine() {
      mineLoading.value = true;
      try {
        const result = await getCourseMarketMine();
        if (result.code === 200 && result.data) {
          mine.published = result.data.published || [];
          mine.borrowed = result.data.borrowed || [];
        }
      } catch (error) {
        console.error(TAG + " 我的公开课加载异常: " + (error?.message || error));
      } finally {
        mineLoading.value = false;
      }
    }

    // ========== 交互 ==========
    function switchTab(tab) {
      activeTab.value = tab;
      if (tab === "mine") loadMine();
    }

    function search() {
      currentPage.value = 1;
      loadMarket();
    }

    function onPageChange(page) {
      currentPage.value = page;
      loadMarket();
    }

    async function borrow(item) {
      actingId.value = item.id;
      try {
        const result = await borrowCourse(item.id);
        if (result.code === 200) {
          ElMessage.success(result.message || "借阅成功");
          loadMarket();
        } else {
          ElMessage.error(result.message || "借阅失败");
        }
      } catch (error) {
        ElMessage.error(error?.response?.data?.message || "借阅失败");
      } finally {
        actingId.value = null;
      }
    }

    async function unborrow(item) {
      actingId.value = item.id;
      try {
        const result = await unborrowCourse(item.id);
        if (result.code === 200) {
          ElMessage.success("已取消借阅");
          loadMarket();
          if (activeTab.value === "mine") loadMine();
        }
      } catch (error) {
        ElMessage.error(error?.response?.data?.message || "操作失败");
      } finally {
        actingId.value = null;
      }
    }

    async function unpublish(item) {
      actingId.value = item.id;
      try {
        const result = await publishCourse(item.id, false);
        if (result.code === 200) {
          ElMessage.success("已取消发布");
          loadMine();
        }
      } catch (error) {
        ElMessage.error(error?.response?.data?.message || "操作失败");
      } finally {
        actingId.value = null;
      }
    }

    function goStudy(courseId) {
      navigate("study", { courseId: String(courseId) });
    }

    function goBack() {
      navigateBack();
    }

    // ========== 生命周期 ==========
    onMounted(() => {
      console.log(TAG + " 广场页已挂载");
      loadMarket();
    });

    return {
      tabs,
      activeTab,
      keyword,
      marketLoading,
      mineLoading,
      marketList,
      marketTotal,
      currentPage,
      pageSize,
      mine,
      actingId,
      switchTab,
      search,
      onPageChange,
      borrow,
      unborrow,
      unpublish,
      goStudy,
      goBack,
    };
  },
};
