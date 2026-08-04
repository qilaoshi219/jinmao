// ==================== 教材全文检索页面业务逻辑 ====================
// 职责：调用全文检索接口，展示命中课程/章节/页码/片段，点击跳转学习

import { ref, inject } from "vue";
import { searchCourses } from "../../api/books";

// 日志前缀
const TAG = "[CourseSearchPage]";

export default {
  setup() {
    // ========== 导航 ==========
    const navigate = inject("navigate", () => {});
    const navigateBack = inject("goBack", () => navigate("home"));

    // ========== 状态 ==========
    const keyword = ref("");
    const loading = ref(false);
    const searched = ref(false);
    const lastKeyword = ref("");
    const results = ref([]);

    // ========== 搜索 ==========
    async function doSearch() {
      const kw = keyword.value.trim();
      if (!kw) return;
      loading.value = true;
      searched.value = false;
      try {
        const result = await searchCourses(kw);
        if (result.code === 200 && result.data) {
          results.value = result.data.results || [];
          lastKeyword.value = result.data.keyword;
          searched.value = true;
          console.log(TAG + " 搜索完成，命中 " + results.value.length + " 条");
        }
      } catch (error) {
        console.error(TAG + " 搜索异常: " + (error?.message || error));
        results.value = [];
        searched.value = true;
      } finally {
        loading.value = false;
      }
    }

    function reset() {
      keyword.value = "";
      results.value = [];
      searched.value = false;
    }

    /** 跳转到命中的章节学习页 */
    function goTo(r) {
      navigate("study", { courseId: r.courseId, chapterId: r.chapterId });
    }

    function goBack() {
      navigateBack();
    }

    return {
      keyword,
      loading,
      searched,
      lastKeyword,
      results,
      doSearch,
      reset,
      goTo,
      goBack,
    };
  },
};
