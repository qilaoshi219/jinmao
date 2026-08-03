// ==================== 手机端首页业务逻辑 ====================
// 职责：管理手机首页所有响应式状态、API 调用、事件处理
// 数据源：用户信息、教材列表、学习进度、余额摘要
// 遵循项目现有页面模式：export default { setup() { ... } }

import { ref, computed, onMounted, inject, nextTick } from "vue";
import { ElMessage } from "element-plus";
import { useAuthStore } from "../../stores/auth";
import { useTheme } from "../../composables/useTheme";
import { getProfile } from "../../api/auth";
import { listBooks } from "../../api/books";
import { getAllProgress } from "../../api/progress";
import { getBilling } from "../../api/billing";

// 导入移动端子组件
import MobileQuickActionGrid from "../../components/mobile/MobileQuickActionGrid.vue";
import MobileCourseListCard from "../../components/mobile/MobileCourseListCard.vue";

// 日志前缀
const TAG = "[MobileHome]";

export default {
  // 注册子组件
  components: {
    MobileQuickActionGrid,
    MobileCourseListCard,
  },

  setup() {
    // ========== 依赖注入 ==========
    const navigate = inject("navigate", (page) => {
      console.warn(TAG + " navigate 未从父组件注入，当前页: " + page);
    });

    // ========== 状态管理 ==========
    const authStore = useAuthStore();

    // ========== 主题管理（必须在此初始化，确保 useDark 接管 html.dark class 管理） ==========
    // 虽然 index.html 预加载脚本已设置初始 class，但 useDark 需要在此初始化
    // 才能持续同步 localStorage 和系统偏好，防止其他模块意外重置主题状态
    useTheme();

    // ========== 响应式数据 ==========

    /** 用户完整信息 */
    const user = ref(authStore.user || {});

    /** 教材列表原始数据 */
    const books = ref([]);

    /** 全部学习进度摘要 */
    const progressList = ref([]);

    /** 余额摘要数据 */
    const balance = ref(null);

    /** 页面加载中标识 */
    const loading = ref(true);

    /** 搜索关键词（本地过滤，不触发后端请求） */
    const searchKeyword = ref("");

    /** 课程区 DOM 引用（用于"我的教材"定位滚动） */
    const courseSectionRef = ref(null);

    // ========== 计算属性 ==========

    /** 用户头像首字母 */
    const userInitial = computed(() => {
      const u = user.value;
      const name = u.nickname || u.username || u.email || "";
      return name.charAt(0).toUpperCase();
    });

    /**
     * 合并教材数据与进度数据的课程列表
     * 排序规则（按计划 3.3）：
     *   1. 有学习记录的优先
     *   2. 有记录按 updateTime 倒序
     *   3. 无记录按教材 createTime 倒序
     */
    const mobileCourseList = computed(() => {
      // 构建进度映射表（key: courseId, value: 进度对象）
      const progressMap = {};
      for (const p of progressList.value) {
        const cid = String(p.courseId);
        // 如果多条进度（多章节），保留最新的那条
        if (!progressMap[cid] || new Date(p.updateTime) > new Date(progressMap[cid].updateTime)) {
          progressMap[cid] = p;
        }
      }

      // 关键词过滤
      const keyword = searchKeyword.value.trim().toLowerCase();
      let list = books.value.map((book) => {
        const cid = String(book.id);
        return {
          course: book,
          progress: progressMap[cid] || null,
        };
      });

      // 搜索过滤
      if (keyword) {
        list = list.filter((item) => {
          const name = (item.course.name || "").toLowerCase();
          return name.includes(keyword);
        });
      }

      // 排序：有进度 -> 无进度，各自按时间倒序
      list.sort((a, b) => {
        const aHasProgress = !!a.progress;
        const bHasProgress = !!b.progress;

        // 有进度的排前面
        if (aHasProgress && !bHasProgress) return -1;
        if (!aHasProgress && bHasProgress) return 1;

        // 都有进度：按 updateTime 倒序
        if (aHasProgress && bHasProgress) {
          return new Date(b.progress.updateTime) - new Date(a.progress.updateTime);
        }

        // 都无进度：按教材 createTime 倒序
        const aTime = a.course.createTime ? new Date(a.course.createTime).getTime() : 0;
        const bTime = b.course.createTime ? new Date(b.course.createTime).getTime() : 0;
        return bTime - aTime;
      });

      return list;
    });

    // ========== 数据加载 ==========

    /** 加载用户完整信息 */
    async function loadUserProfile() {
      console.log(TAG + " 加载用户信息...");
      try {
        const result = await getProfile();
        if (result.code === 200 && result.data) {
          user.value = { ...user.value, ...result.data };
          authStore.user = { ...authStore.user, ...result.data };
          console.log(TAG + " 用户信息加载成功: " + (result.data.nickname || result.data.email));
        }
      } catch (error) {
        console.warn(TAG + " 用户信息加载失败: " + (error?.message || error));
      }
    }

    /** 加载教材列表 */
    async function loadBooks() {
      console.log(TAG + " 加载教材列表...");
      try {
        const result = await listBooks({ page: 1, pageSize: 100 });
        // 教材接口 code: 0 表示成功
        if (result.code === 0 && result.data) {
          books.value = result.data.items || [];
          console.log(TAG + " 教材列表加载成功: " + books.value.length + " 本");
        }
      } catch (error) {
        console.warn(TAG + " 教材列表加载失败: " + (error?.message || error));
      }
    }

    /** 加载全部学习进度 */
    async function loadProgress() {
      console.log(TAG + " 加载学习进度...");
      try {
        const result = await getAllProgress();
        // getAllProgress 返回 code 200 表示成功
        if (result.code === 200 && Array.isArray(result.data)) {
          progressList.value = result.data;
          console.log(TAG + " 学习进度加载成功: " + result.data.length + " 条记录");
        }
      } catch (error) {
        console.warn(TAG + " 学习进度加载失败: " + (error?.message || error));
      }
    }

    /** 加载余额摘要 */
    async function loadBalance() {
      console.log(TAG + " 加载余额信息...");
      try {
        const result = await getBilling(1, 1);
        if (result.code === 200 && result.data) {
          balance.value = result.data;
          console.log(TAG + " 余额信息加载成功: " + (result.data.balance || 0));
        }
      } catch (error) {
        console.warn(TAG + " 余额信息加载失败: " + (error?.message || error));
      }
    }

    // ========== 事件处理 ==========

    /** 快捷入口点击分发 */
    function handleQuickAction(key) {
      console.log(TAG + " 快捷入口点击: " + key);

      switch (key) {
        case "my-courses":
          // 滚动到"我的课程"区域
          scrollToCourseSection();
          break;
        case "quiz-training":
          // 进入手机端刷题页（选择题库 / 答题）
          navigate("mobile-quiz");
          break;
        case "quiz-market":
          // 进入手机端题库市场页
          navigate("mobile-market");
          break;
        case "my-balance":
          // 进入手机端账单页
          navigate("mobile-billing");
          break;
        default:
          console.warn(TAG + " 未知快捷入口: " + key);
      }
    }

    /** 滚动到课程区域 */
    function scrollToCourseSection() {
      console.log(TAG + " 滚动到课程区");
      nextTick(() => {
        if (courseSectionRef.value) {
          courseSectionRef.value.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }

    /** 进入个人中心 */
    function goToProfile() {
      console.log(TAG + " 进入手机端个人中心");
      navigate("mobile-profile");
    }

    /** 前往桌面版首页 */
    function goToDesktop() {
      console.log(TAG + " 前往桌面版首页");
      navigate("home");
    }

    /**
     * 打开课程学习页
     * @param {string|number} courseId - 教材 ID
     */
    function onOpenCourse(courseId) {
      console.log(TAG + " 进入课程学习，id: " + courseId);

      // 查找课程对象校验状态
      const course = books.value.find((c) => String(c.id) === String(courseId));
      if (!course) {
        console.warn(TAG + " 课程不存在于列表中，id: " + courseId);
        ElMessage.error("课程数据异常，请刷新后重试");
        return;
      }

      // 终端状态检查
      const TERMINAL = ["completed", "partial_completed", "failed", "error"];
      if (!TERMINAL.includes(course.pipelineStatus)) {
        console.log(TAG + " 课程尚未生成完毕，当前状态: " + course.pipelineStatus);
        ElMessage.warning("课程内容正在生成中，请稍后再试");
        return;
      }

      // 导航到学习页
      navigate("study", { courseId: String(courseId) });
    }

    // ========== 生命周期 ==========

    onMounted(async () => {
      console.log(TAG + " 手机端首页已挂载");

      // 并行加载所有数据
      loading.value = true;
      try {
        await Promise.all([
          loadUserProfile(),
          loadBooks(),
          loadProgress(),
          loadBalance(),
        ]);
        console.log(TAG + " 所有数据加载完毕");
      } catch (error) {
        console.error(TAG + " 数据加载异常: " + (error?.message || error));
      } finally {
        loading.value = false;
      }
    });

    // ========== 导出给模板使用 ==========
    return {
      // 状态
      user,
      loading,
      searchKeyword,
      // 计算属性
      userInitial,
      mobileCourseList,
      // DOM 引用
      courseSectionRef,
      // 方法
      handleQuickAction,
      goToProfile,
      goToDesktop,
      onOpenCourse,
    };
  },
};
