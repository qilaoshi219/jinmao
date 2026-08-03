// ==================== 管理后台：兑换码管理 Tab 组件 ====================
// 职责：一键生成兑换码、分页查询兑换码列表、状态筛选、一键复制
window.AdminTabs = window.AdminTabs || {};
AdminTabs.codes = {
  name: 'CodesTab',
  setup() {
    const { apiGet, apiPost, apiBase, doLogout, isDark, formatTime } = AdminShared;
    const TAG = '[AdminCodes]';

    // ===== 生成兑换码 =====
    const generatingCodes = Vue.ref(false);
    const newCodes = Vue.ref([]);

    // ===== 兑换码列表 =====
    const codeList = Vue.ref([]);
    const loadingCodeList = Vue.ref(false);
    const codePage = Vue.ref(1);
    const codePageSize = Vue.ref(20);
    const codeTotal = Vue.ref(0);
    const statusFilter = Vue.ref('all');

    // ===== 生成兑换码 =====
    async function generateCodes() {
      generatingCodes.value = true;
      try {
        const data = await apiPost(apiBase.value + '/codes/generate', { count: 10 });
        if (data.code === 0) {
          newCodes.value = data.data.codes || [];
          ElementPlus.ElMessage.success(data.message);
          // 刷新列表
          codePage.value = 1;
          await loadCodeList();
        } else if (data.code === 401) {
          doLogout();
          ElementPlus.ElMessage.error('登录已过期，请重新登录。');
        } else {
          ElementPlus.ElMessage.error(data.message || '生成失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      generatingCodes.value = false;
    }

    // ===== 加载兑换码列表 =====
    async function loadCodeList() {
      loadingCodeList.value = true;
      try {
        const params = new URLSearchParams({
          page: codePage.value,
          pageSize: codePageSize.value,
          status: statusFilter.value,
        });
        const data = await apiGet(apiBase.value + '/codes?' + params.toString());
        if (data.code === 0) {
          codeList.value = data.data.codes || [];
          codeTotal.value = data.data.pagination?.total || 0;
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '加载失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      loadingCodeList.value = false;
    }

    // ===== 标记兑换码为已分发 =====
    async function markDistributed(row) {
      try {
        const data = await apiPost(apiBase.value + '/codes/' + row.id + '/mark-distributed');
        if (data.code === 0) {
          // 同步更新新生成卡片与列表中的对应行
          row.distributedAt = data.data.distributedAt;
          const target = codeList.value.find((r) => String(r.id) === String(row.id));
          if (target) target.distributedAt = data.data.distributedAt;
        } else if (data.code === 401) {
          doLogout();
          ElementPlus.ElMessage.error('登录已过期，请重新登录。');
        } else {
          ElementPlus.ElMessage.warning(data.message || '标记已分发失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.warning('已复制，但标记已分发失败，请检查网络后刷新页面。');
      }
    }

    // ===== 复制兑换码（复制后自动标记为已分发） =====
    async function copyCode(row) {
      // 已分发的兑换码再次复制时提醒，防止重复分发给多个用户
      if (row.distributedAt) {
        try {
          await ElementPlus.ElMessageBox.confirm(
            '该兑换码已于 ' + formatTime(row.distributedAt) + ' 标记为已分发，确认再次复制吗？',
            '重复分发提醒',
            { confirmButtonText: '继续复制', cancelButtonText: '取消', type: 'warning' }
          );
        } catch (err) {
          return; // 用户取消复制
        }
      }

      const code = row.code;
      try {
        await navigator.clipboard.writeText(code);
        ElementPlus.ElMessage.success('已复制到剪贴板: ' + code);
      } catch (err) {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        ElementPlus.ElMessage.success('已复制到剪贴板');
      }
      // 复制成功后自动标记为已分发
      await markDistributed(row);
    }

    Vue.onMounted(() => {
      loadCodeList();
      console.log(TAG + ' 兑换码 Tab 已挂载');
    });

    return {
      generatingCodes, newCodes,
      codeList, loadingCodeList, codePage, codePageSize, codeTotal, statusFilter,
      generateCodes, loadCodeList, copyCode, markDistributed, formatTime, isDark,
    };
  },
};
