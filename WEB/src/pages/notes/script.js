// ==================== 我的笔记页面业务逻辑 ====================
// 职责：加载全部笔记并按课程分组；去学习跳转、删除、导出 Markdown

import { ref, computed, inject, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { getNotes, deleteNote } from "../../api/books";

// 日志前缀
const TAG = "[NotesPage]";

export default {
  setup() {
    // ========== 导航 ==========
    const navigate = inject("navigate", () => {});
    const navigateBack = inject("goBack", () => navigate("home"));

    // ========== 状态 ==========
    const loading = ref(true);
    const list = ref([]);
    const deletingId = ref(null);

    /** 按课程分组（保持更新时间倒序） */
    const groups = computed(() => {
      const map = new Map();
      for (const n of list.value) {
        if (!map.has(n.courseId)) {
          map.set(n.courseId, { courseId: n.courseId, courseName: n.courseName, notes: [] });
        }
        map.get(n.courseId).notes.push(n);
      }
      return Array.from(map.values());
    });

    // ========== 数据加载 ==========
    async function loadNotes() {
      loading.value = true;
      try {
        const result = await getNotes();
        if (result.code === 200) {
          list.value = result.data || [];
        }
      } catch (error) {
        console.error(TAG + " 笔记加载异常: " + (error?.message || error));
      } finally {
        loading.value = false;
      }
    }

    // ========== 交互 ==========
    function goStudy(courseId, chapterId) {
      navigate("study", { courseId: String(courseId), chapterId: String(chapterId) });
    }

    async function remove(n) {
      deletingId.value = n.id;
      try {
        const result = await deleteNote(n.id);
        if (result.code === 200) {
          ElMessage.success("笔记已删除");
          loadNotes();
        } else {
          ElMessage.error(result.message || "删除失败");
        }
      } catch (error) {
        ElMessage.error(error?.response?.data?.message || "删除失败");
      } finally {
        deletingId.value = null;
      }
    }

    /** 导出全部笔记为 Markdown 文件 */
    function exportNotes() {
      const lines = ["# 我的学习笔记", ""];
      for (const g of groups.value) {
        lines.push("## " + g.courseName, "");
        for (const n of g.notes) {
          lines.push("### " + n.chapterName + " · 第 " + n.pageNumber + " 页");
          lines.push("> " + timeText(n.updateTime), "");
          lines.push(n.content, "", "---", "");
        }
      }
      const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "我的笔记.md";
      a.click();
      URL.revokeObjectURL(url);
      ElMessage.success("笔记已导出");
    }

    // ========== 样式工具 ==========
    function noteBg(color) {
      const map = { yellow: "#fef9c3", green: "#dcfce7", blue: "#dbeafe", pink: "#fce7f3" };
      return map[color] || map.yellow;
    }
    function noteBorder(color) {
      const map = { yellow: "#fde68a", green: "#86efac", blue: "#93c5fd", pink: "#f9a8d4" };
      return map[color] || map.yellow;
    }
    function noteText(color) {
      const map = { yellow: "text-amber-600", green: "text-green-600", blue: "text-blue-600", pink: "text-pink-600" };
      return map[color] || "text-amber-600";
    }
    function timeText(t) {
      if (!t) return "";
      const d = new Date(t);
      return d.getMonth() + 1 + "月" + d.getDate() + "日";
    }

    function goBack() {
      navigateBack();
    }

    // ========== 生命周期 ==========
    onMounted(() => {
      console.log(TAG + " 笔记页已挂载");
      loadNotes();
    });

    return {
      loading,
      groups,
      deletingId,
      loadNotes,
      goStudy,
      remove,
      exportNotes,
      noteBg,
      noteBorder,
      noteText,
      timeText,
      goBack,
    };
  },
};
