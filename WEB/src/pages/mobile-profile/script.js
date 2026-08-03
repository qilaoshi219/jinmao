// ==================== 手机端个人中心页面逻辑 ====================
// 职责：承载手机端个人中心最小逻辑闭环
//       读取 authStore.user、导航到各功能页、深色模式切换、退出登录

import { ref, computed, onMounted, inject } from "vue";
import { useAuthStore } from "../../stores/auth";
import { useTheme } from "../../composables/useTheme";
import { ElMessageBox } from "element-plus";

// 日志前缀
const TAG = "[MobileProfile]";

export default {
  setup() {
    // ========== 依赖注入 ==========
    const navigate = inject("navigate", (page) => {
      console.warn(TAG + " navigate 未从父组件注入，当前页: " + page);
    });
    // 返回上一页函数（从 App.vue 注入，无应用内历史时兜底回手机端首页）
    const navigateBack = inject("goBack", () => navigate("mobile-home"));

    // ========== 状态管理 ==========
    const authStore = useAuthStore();
    const { isDark, toggleTheme } = useTheme();

    // ========== 计算属性 ==========

    /** 用户信息 */
    const user = computed(() => authStore.user || {});

    /** 用户头像首字母 */
    const userInitial = computed(() => {
      const u = user.value;
      const name = u.nickname || u.username || u.email || "";
      return name.charAt(0).toUpperCase();
    });

    // ========== 事件处理 ==========

    /** 返回上一页 */
    function goBack() {
      console.log(TAG + " 返回上一页");
      navigateBack();
    }

    /** 进入个人资料编辑（手机端个人设置页） */
    function goToProfileEdit() {
      console.log(TAG + " 进入个人资料编辑");
      navigate("mobile-settings");
    }

    /** 进入我的余额（手机端账单页） */
    function goToBalance() {
      console.log(TAG + " 进入我的余额");
      navigate("mobile-billing");
    }

    /** 切换深色模式 */
    function handleToggleTheme() {
      console.log(TAG + " 切换深色模式，当前: " + (isDark.value ? "暗黑" : "亮色"));
      toggleTheme();
    }

    /** 退出登录（带确认弹窗） */
    async function handleLogout() {
      console.log(TAG + " 用户请求退出登录");
      try {
        await ElMessageBox.confirm(
          "确定要退出登录吗？",
          "退出确认",
          {
            confirmButtonText: "退出",
            cancelButtonText: "取消",
            type: "warning",
          }
        );
        console.log(TAG + " 用户确认退出");
        authStore.logout();
      } catch (_) {
        // 用户取消退出
        console.log(TAG + " 用户取消退出");
      }
    }

    // ========== 生命周期 ==========
    onMounted(async () => {
      console.log(TAG + " 个人中心页面已挂载");

      // 确保用户信息已加载
      if (!authStore.user || !authStore.user.email) {
        try {
          await authStore.fetchProfile();
          console.log(TAG + " 用户信息已补加载");
        } catch (error) {
          console.warn(TAG + " 用户信息加载失败: " + (error?.message || error));
        }
      }
    });

    // ========== 导出给模板 ==========
    return {
      // 状态
      user,
      isDark,
      // 计算属性
      userInitial,
      // 方法
      goBack,
      goToProfileEdit,
      goToBalance,
      handleToggleTheme,
      handleLogout,
    };
  },
};
