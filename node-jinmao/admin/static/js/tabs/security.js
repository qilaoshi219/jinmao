// ==================== 管理后台：安全防护 Tab 组件 ====================
// 职责：攻击事件筛选/分页列表、标记已处理、详情弹窗展示全部字段
// 数据在 Tab 激活时加载（与消费统计 Tab 相同的懒加载策略）
window.AdminTabs = window.AdminTabs || {};
AdminTabs.security = {
  name: 'SecurityTab',
  props: {
    active: { type: Boolean, default: false },
  },
  setup(props) {
    const {
      apiGet, apiPut, apiBase, doLogout, isDark,
      formatTime, truncateStr,
      attackTypeOptions, attackTypeLabel, severityType, severityLabel, blockedLabel, blockedType,
    } = AdminShared;
    const TAG = '[AdminSecurity]';

    // ===== 攻击事件列表 =====
    const securityEvents = Vue.ref([]);
    const loadingSecurityEvents = Vue.ref(false);
    const secPage = Vue.ref(1);
    const secPageSize = Vue.ref(20);
    const secTotal = Vue.ref(0);
    const handlingEventId = Vue.ref('');

    // ===== 筛选条件 =====
    const secTypeFilter = Vue.ref('all');
    const secSeverityFilter = Vue.ref('all');
    const secHandledFilter = Vue.ref('all');
    const secIpFilter = Vue.ref('');

    // ===== 详情弹窗 =====
    const secDetailVisible = Vue.ref(false);
    const secDetailRow = Vue.ref(null);

    // ===== 导出 CSV =====
    const exportingSecurity = Vue.ref(false);

    // ===== 展示攻击事件详情弹窗（展示 SecurityEvent 表全部字段） =====
    function showSecurityDetail(row) {
      secDetailRow.value = row;
      secDetailVisible.value = true;
    }

    // ===== 导出攻击事件 CSV（按当前筛选条件全量导出，不受分页限制） =====
    async function exportSecurityEvents() {
      exportingSecurity.value = true;
      try {
        const params = new URLSearchParams({
          attackType: secTypeFilter.value || 'all',
          severity: secSeverityFilter.value || 'all',
          handled: secHandledFilter.value || 'all',
          ip: secIpFilter.value || '',
        });
        const res = await fetch(apiBase.value + '/security/export?' + params.toString(), {
          headers: { 'Authorization': 'Bearer ' + AdminShared.auth.token },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (data && data.code === 401) {
            doLogout();
            ElementPlus.ElMessage.error('登录已过期，请重新登录。');
          } else {
            ElementPlus.ElMessage.error((data && data.message) || '导出失败（HTTP ' + res.status + '）。');
          }
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const pad = (n) => String(n).padStart(2, '0');
        const now = new Date();
        const a = document.createElement('a');
        a.href = url;
        a.download = 'security_events_' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
          '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        ElementPlus.ElMessage.success('导出成功。');
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      exportingSecurity.value = false;
    }

    // ===== 加载攻击事件列表（支持筛选 + 分页） =====
    async function loadSecurityEvents() {
      loadingSecurityEvents.value = true;
      try {
        const params = new URLSearchParams({
          page: secPage.value,
          pageSize: secPageSize.value,
          attackType: secTypeFilter.value || 'all',
          severity: secSeverityFilter.value || 'all',
          handled: secHandledFilter.value || 'all',
          ip: secIpFilter.value || '',
        });
        const data = await apiGet(apiBase.value + '/security/events?' + params.toString());
        if (data.code === 0) {
          securityEvents.value = data.data?.events || [];
          secTotal.value = data.data?.pagination?.total || 0;
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '加载攻击事件失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      loadingSecurityEvents.value = false;
    }

    // ===== 标记攻击事件为已处理 =====
    async function handleSecurityEvent(row) {
      handlingEventId.value = row.id;
      try {
        const data = await apiPut(apiBase.value + '/security/events/' + row.id + '/handle', {});
        if (data.code === 0) {
          ElementPlus.ElMessage.success('攻击事件已标记处理。');
          await loadSecurityEvents();
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '标记失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      handlingEventId.value = '';
    }

    // ===== Tab 激活时加载列表（懒加载） =====
    Vue.watch(() => props.active, (val) => {
      if (val) loadSecurityEvents();
    });

    Vue.onMounted(() => {
      if (props.active) loadSecurityEvents();
      console.log(TAG + ' 安全防护 Tab 已挂载');
    });

    return {
      securityEvents, loadingSecurityEvents,
      secPage, secPageSize, secTotal, handlingEventId,
      secTypeFilter, secSeverityFilter, secHandledFilter, secIpFilter,
      secDetailVisible, secDetailRow, showSecurityDetail,
      exportingSecurity, exportSecurityEvents,
      loadSecurityEvents, handleSecurityEvent,
      formatTime, truncateStr, isDark,
      attackTypeOptions, attackTypeLabel, severityType, severityLabel, blockedLabel, blockedType,
    };
  },
};
