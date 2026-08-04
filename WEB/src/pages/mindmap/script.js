// ============================================================================
// 文件名：script.js（思维导图查看页业务逻辑）
// 所属组件：pages/mindmap/index.vue
// 文件作用：读取 mindmapParams（courseId/chapterId），查询思维导图状态，
//           拿到 mindmapUrl 后渲染 iframe；顶栏标题展示课程·章节名
//
// 数据流：
//   App.vue navigate("mindmap", { courseId, chapterId }) → provide mindmapParams
//   → MindmapPage inject("mindmapParams") → getMindmapStatus() → iframe 渲染
//
// 依赖关系：useTheme、api/mindmap、api/books
// ============================================================================

import { ref, inject, computed, onMounted } from "vue";
import { useTheme } from "../../composables/useTheme";
import { getMindmapStatus } from "../../api/mindmap";
import { getBookDetail } from "../../api/books";

// 日志前缀
const TAG = "[MindmapPage]";

export default {
  setup() {
    // ==================== 依赖注入 ====================
    /** 导航函数（从 App.vue 注入） */
    const navigate = inject("navigate", () => {});
    /** 返回上一页函数（从 App.vue 注入，无历史时兜底回首页） */
    const goBack = inject("goBack", () => navigate("home"));
    /** 思维导图页参数（courseId / chapterId） */
    const mindmapParams = inject("mindmapParams", null);

    // ==================== 主题切换 ====================
    const { isDark, toggleTheme } = useTheme();

    // ==================== 响应式数据 ====================
    /** 思维导图 HTML 代理访问 URL（为空则显示未生成空态） */
    const mindmapUrl = ref("");
    /**
     * 带主题参数的 iframe 地址
     * 主题切换时重新计算（配合模板 :key 强制 iframe 重载），
     * 让思维导图 HTML 通过 ?theme=dark/light 应用 markmap 暗黑样式
     */
    const mindmapSrc = computed(() => {
      if (!mindmapUrl.value) return "";
      const sep = mindmapUrl.value.includes("?") ? "&" : "?";
      return mindmapUrl.value + sep + "theme=" + (isDark.value ? "dark" : "light");
    });
    /** 页面加载状态（查询状态 + iframe 首次加载前） */
    const loading = ref(true);
    /** 顶栏标题：章节名 · 思维导图 */
    const title = ref("思维导图");

    /**
     * 加载思维导图状态并填充 iframe URL
     * 未生成时保持空态；同时尝试读取课程详情补充标题
     */
    async function loadMindmap() {
      const courseId = mindmapParams?.value?.courseId;
      const chapterId = mindmapParams?.value?.chapterId;
      if (!courseId || !chapterId) {
        console.warn(TAG + " 缺少 courseId/chapterId，显示空态");
        loading.value = false;
        return;
      }

      try {
        const result = await getMindmapStatus(courseId, chapterId);
        if (result.code === 0 && result.data?.status === "done" && result.data.mindmapUrl) {
          mindmapUrl.value = result.data.mindmapUrl;
          console.log(TAG + " 思维导图 URL: " + mindmapUrl.value);
        } else {
          console.log(TAG + " 思维导图状态: " + (result.data?.status || "none"));
        }
      } catch (error) {
        console.warn(TAG + " 思维导图状态查询失败: " + (error?.message || error));
      }

      // 补充标题：课程名 + 章节名（失败不影响主体展示）
      try {
        const detail = await getBookDetail(courseId);
        const chapter = (detail.data?.chapters || []).find((c) => String(c.id) === String(chapterId));
        title.value = (chapter?.name || "章节") + " · 思维导图";
      } catch (error) {
        console.warn(TAG + " 课程详情读取失败（不影响展示）: " + (error?.message || error));
      } finally {
        loading.value = false;
      }
    }

    /** iframe 加载完成：关闭加载指示 */
    function onMindmapLoad() {
      loading.value = false;
      console.log(TAG + " 思维导图 iframe 加载完成");
    }

    onMounted(loadMindmap);

    return {
      // 主题
      isDark,
      toggleTheme,
      // 导航
      goBack,
      // 数据
      title,
      mindmapUrl,
      mindmapSrc,
      loading,
      onMindmapLoad,
    };
  },
};
