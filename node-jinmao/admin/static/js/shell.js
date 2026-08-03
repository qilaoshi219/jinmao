// ==================== 管理后台：主界面外壳组件 ====================
// 职责：顶栏（后缀徽标/邮箱/主题/安全徽标/退出）+ 六个功能 Tab 容器
// 未处理攻击数每 30 秒轮询刷新，点击徽标跳转安全防护 Tab
window.AdminShell = {
  name: 'AdminShell',
  setup() {
    const { auth, apiGet, apiBase, doLogout, isDark, toggleTheme, currentSuffix } = AdminShared;
    const TAG = '[AdminShell]';

    const activeTab = Vue.ref('codes');
    const unreadAttackCount = Vue.ref(0);
    const windowLocation = window.location.origin;
    let unreadTimer = null;

    // ===== 加载未处理攻击事件数（顶栏徽标提醒） =====
    async function loadUnreadCount() {
      try {
        const data = await apiGet(apiBase.value + '/security/unread-count');
        if (data.code === 0) {
          unreadAttackCount.value = data.data?.count || 0;
        } else if (data.code === 401) {
          doLogout();
        }
      } catch (err) {
        // 轮询请求失败静默处理，避免频繁报错
        console.error(TAG + ' 加载未处理攻击数失败: ' + err.message);
      }
    }

    // ===== 未处理攻击数轮询（每 30 秒刷新一次） =====
    function startUnreadPolling() {
      if (unreadTimer) return; // 避免重复启动
      unreadTimer = setInterval(loadUnreadCount, 30000);
    }

    function stopUnreadPolling() {
      if (unreadTimer) {
        clearInterval(unreadTimer);
        unreadTimer = null;
      }
    }

    // ===== 顶栏徽标点击：切换到安全防护 Tab =====
    function switchToSecurityTab() {
      activeTab.value = 'security';
    }

    Vue.onMounted(() => {
      // 加载未处理攻击数并启动轮询提醒
      loadUnreadCount();
      startUnreadPolling();
      // 监听 Tab 切换：切到安全防护 Tab 时同步未处理数（标记已处理后徽标保持一致）
      Vue.watch(activeTab, (tab) => {
        if (tab === 'security') loadUnreadCount();
      });
      console.log(TAG + ' 主界面已挂载，后缀: ' + currentSuffix);
    });

    // 组件卸载时清理轮询定时器，避免内存泄漏
    Vue.onUnmounted(stopUnreadPolling);

    return {
      auth, isDark, toggleTheme, currentSuffix, windowLocation,
      activeTab, unreadAttackCount, switchToSecurityTab, doLogout,
    };
  },
};
