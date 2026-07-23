// ==================== 首页业务逻辑 ====================
// 职责：管理首页所有响应式状态、API 调用、事件处理
// 通过 setup() 导出给 index.vue 模板使用
// 数据流：App.vue → HomePage → { HomeSidebar, HomeTopbar, CourseCard, UploadBookDialog }

import { ref, reactive, onMounted, onUnmounted, computed, inject } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useAuthStore } from "../../stores/auth";
import { useTheme } from "../../composables/useTheme";
import { getProfile } from "../../api/auth";
import { listBooks, getBookStatus } from "../../api/books";
import apiClient from "../../api/client";

// 导入子组件（供模板使用）
import HomeSidebar from "../../components/HomeSidebar.vue";
import HomeTopbar from "../../components/HomeTopbar.vue";
import CourseCard from "../../components/CourseCard.vue";
import UploadBookDialog from "../../components/UploadBookDialog.vue";
import CourseFilesDialog from "../../components/CourseFilesDialog.vue"; // 【临时】教材文件列表弹窗，未来会删除

// 日志前缀
const TAG = "[HomePage]";

// ==================== 导出 setup（Vue 3 标准写法） ====================
// 注意：这里用 export default { setup() } 而不是 <script setup>
// 因为项目使用 template/script 分离模式（通过 <script src="./script.js"> 引用）
export default {
  // 注册子组件
  components: {
    HomeSidebar,
    HomeTopbar,
    CourseCard,
    UploadBookDialog,
    CourseFilesDialog, // 【临时】教材文件列表弹窗，未来会删除
  },

  setup() {
    // ========== 导航（从 App.vue 注入）==========
    const navigate = inject("navigate", (page) => {
      console.warn(TAG + " navigate 未从父组件注入，当前页: " + page);
    });
    // ========== 状态管理 ==========
    const authStore = useAuthStore();
    const { isDark, toggleTheme } = useTheme();

    // ========== 响应式数据 ==========

    /** 用户完整信息 */
    const user = ref(authStore.user || {});

    /** 教材列表数据 */
    const courses = ref([]);

    /** 加载中的标识 */
    const loading = ref(true);

    /** 教材总数（分页用） */
    const total = ref(0);

    /** 当前页码 */
    const currentPage = ref(1);

    /** 每页条数 */
    const pageSize = ref(12);

    /** 搜索关键词（暂未启用） */
    const keyword = ref("");

    /** 上传弹窗可见性 */
    const uploadDialogVisible = ref(false);

    /** 上传中标识 */
    const isUploading = ref(false);

    /** 当前激活菜单 */
    const activeMenu = ref("courses");

    /** 排序方式 */
    const sortBy = ref("default");

    // ===== 【临时】教材文件列表弹窗状态（未来会删除） =====
    /** 文件列表弹窗可见性 */
    const courseFilesDialogVisible = ref(false);

    /** 当前选中教材的 ID */
    const currentCourseId = ref(null);

    /** 当前选中教材的名称 */
    const currentCourseName = ref("");

    /** 教材状态轮询定时器 */
    let pollTimer = null;

    /** 轮询间隔（毫秒） */
    const POLL_INTERVAL = 3000;

    // ========== 计算属性 ==========

    /** 是否有教材处于处理中状态（需要轮询） */
    const hasProcessingCourses = computed(() => {
      // 终端状态白名单：凡不在此列表内的状态均视为"处理中"
      const TERMINAL = ["completed", "partial_completed", "failed", "error"];
      return courses.value.some(
        (c) => c.pipelineStatus && !TERMINAL.includes(c.pipelineStatus)
      );
    });

    // ========== 数据加载 ==========

    /**
     * 加载教材列表
     * 调用 GET /api/v1/books 获取分页教材数据
     */
    async function loadCourses() {
      console.log(TAG + " 开始加载教材列表，page: " + currentPage.value);

      try {
        const result = await listBooks({
          page: currentPage.value,
          pageSize: pageSize.value,
          keyword: keyword.value || undefined,
        });

        // 教材接口返回 code: 0 表示成功（与 auth 接口的 code: 200 不同）
        if (result.code === 0 && result.data) {
          courses.value = result.data.items || [];
          total.value = result.data.total || 0;
          console.log(
            TAG + " 教材列表加载成功，共 " + total.value + " 条，当前页 " +
            courses.value.length + " 条"
          );
        } else {
          console.warn(TAG + " 教材列表加载返回异常: code=" + result.code + " msg=" + result.message);
          courses.value = [];
          total.value = 0;
        }
      } catch (error) {
        console.error(TAG + " 教材列表加载失败: " + (error?.message || error));
        courses.value = [];
        total.value = 0;

        // 只在非401错误时提示（401由 client.js 拦截器处理）
        if (error?.response?.status !== 401) {
          ElMessage.error("教材列表加载失败");
        }
      } finally {
        loading.value = false;
      }
    }

    /**
     * 加载用户完整信息
     * 调用 GET /api/v1/auth/profile
     */
    async function loadUserProfile() {
      console.log(TAG + " 开始加载用户信息");

      try {
        const result = await getProfile();

        if (result.code === 200 && result.data) {
          user.value = { ...user.value, ...result.data };
          // 同步更新 Pinia Store
          authStore.user = { ...authStore.user, ...result.data };
          console.log(TAG + " 用户信息加载成功: " + (result.data.nickname || result.data.email));
        } else {
          console.warn(TAG + " 用户信息加载失败: " + result.message);
        }
      } catch (error) {
        console.error(TAG + " 用户信息加载异常: " + (error?.message || error));
      }
    }

    /**
     * 教材状态轮询（有处理中的教材时自动刷新列表）
     * 每 3 秒检查一次，所有教材就绪后自动停止
     */
    function startPollingIfNeeded() {
      // 先清除已有定时器
      stopPolling();

      if (hasProcessingCourses.value) {
        console.log(TAG + " 检测到处理中的教材，启动轮询（间隔 " + POLL_INTERVAL + "ms）");
        pollTimer = setInterval(async () => {
          console.log(TAG + " [轮询] 刷新教材列表...");

          // 静默刷新（不显示加载动画）
          try {
            const result = await listBooks({
              page: currentPage.value,
              pageSize: pageSize.value,
            });

            if (result.code === 0 && result.data) {
              courses.value = result.data.items || [];
              total.value = result.data.total || 0;

              // 检查是否还有处理中的教材
              if (!hasProcessingCourses.value) {
                console.log(TAG + " 所有教材已处理完毕，停止轮询");
                stopPolling();
              }
            }
          } catch (error) {
            // 轮询失败不提示用户，静默处理
            console.warn(TAG + " [轮询] 刷新失败: " + (error?.message || error));
          }
        }, POLL_INTERVAL);
      }
    }

    /** 停止轮询 */
    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
        console.log(TAG + " 轮询已停止");
      }
    }

    // ========== 事件处理 ==========

    /**
     * 打开上传弹窗
     */
    function openUploadDialog() {
      console.log(TAG + " 打开上传弹窗");
      uploadDialogVisible.value = true;
    }

    /**
     * 上传成功回调
     * 关闭弹窗 → 刷新教材列表 → 启动轮询
     */
    function onUploadSuccess(data) {
      console.log(TAG + " 上传成功回调，book_id: " + (data?.book_id || "未知"));
      isUploading.value = false;
      uploadDialogVisible.value = false;

      // 刷新教材列表（回到第一页）
      currentPage.value = 1;
      loadCourses().then(() => {
        startPollingIfNeeded();
      });
    }

    /**
     * 翻页处理
     */
    function onPageChange(page) {
      console.log(TAG + " 翻页: " + page);
      currentPage.value = page;
      loading.value = true;
      loadCourses().then(() => {
        // 滚动到顶部
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    /**
     * 查看教材详情 — 【临时】改为打开文件列表弹窗
     * @param {string|number} courseId - 教材 ID
     */
    function onOpenCourse(courseId) {
      console.log(TAG + " 进入课程学习，id: " + courseId);
      // 导航到课程学习页
      navigate("study");
    }

    /**
     * 删除教材（需确认）
     * @param {string|number} courseId - 教材 ID
     */
    async function onDeleteCourse(courseId) {
      console.log(TAG + " 删除教材，id: " + courseId);

      try {
        // 调用 DELETE /api/v1/books/:id
        const response = await apiClient.delete("/books/" + courseId);
        const result = response.data;

        if (result.code === 0) {
          ElMessage.success("教材已删除");
          console.log(TAG + " 教材删除成功，id: " + courseId);

          // 刷新列表（保持当前页，如果当前页空了则回退一页）
          loadCourses().then(() => {
            if (courses.value.length === 0 && currentPage.value > 1) {
              currentPage.value -= 1;
              loadCourses();
            }
          });
        } else {
          ElMessage.error(result.message || "删除失败");
          console.warn(TAG + " 教材删除失败: " + result.message);
        }
      } catch (error) {
        const errMsg = error?.response?.data?.message || error?.message || "删除失败";
        console.error(TAG + " 教材删除异常: " + errMsg);
        ElMessage.error("删除失败: " + errMsg);
      }
    }

    /**
     * 设置激活菜单
     */
    function setActiveMenu(menu) {
      console.log(TAG + " 切换菜单: " + menu);
      activeMenu.value = menu;
      // 当前只有 "courses" 菜单可用，其他菜单点击不跳转
      if (menu !== "courses") {
        ElMessage.info("该功能即将上线");
      }
    }

    /**
     * 退出登录
     */
    function handleLogout() {
      console.log(TAG + " 用户退出登录");
      stopPolling(); // 停止轮询
      authStore.logout();
    }

    // ========== 生命周期 ==========

    onMounted(async () => {
      console.log(TAG + " 首页已挂载");

      // 1. 加载用户信息
      await loadUserProfile();

      // 2. 加载教材列表
      await loadCourses();

      // 3. 检查是否需要轮询
      startPollingIfNeeded();
    });

    onUnmounted(() => {
      console.log(TAG + " 首页即将卸载");
      stopPolling();
    });

    // ========== 导出给模板使用 ==========
    return {
      // 状态
      user,
      courses,
      loading,
      total,
      currentPage,
      pageSize,
      uploadDialogVisible,
      isUploading,
      activeMenu,
      isDark,
      sortBy,

      // ===== 【临时】教材文件列表弹窗状态（未来会删除） =====
      courseFilesDialogVisible,
      currentCourseId,
      currentCourseName,

      // 方法
      toggleTheme,
      loadCourses,
      openUploadDialog,
      onUploadSuccess,
      onPageChange,
      onOpenCourse,
      onDeleteCourse,
      setActiveMenu,
      handleLogout,
    };
  },
};
