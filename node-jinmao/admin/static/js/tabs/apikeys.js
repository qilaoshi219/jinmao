// ==================== 管理后台：API 密钥 Tab 组件 ====================
// 职责：查看 5 个 AI 服务密钥的配置状态（脱敏）、在线修改并写回 .env（重启后生效）
window.AdminTabs = window.AdminTabs || {};
AdminTabs.apikeys = {
  name: 'ApiKeysTab',
  setup() {
    const { apiGet, apiPut, apiBase, doLogout, isDark } = AdminShared;
    const TAG = '[AdminApiKeys]';

    const loading = Vue.ref(true);
    const saving = Vue.ref(false);
    const items = Vue.ref([]);

    // ===== 加载密钥状态（仅脱敏值） =====
    async function loadKeys() {
      loading.value = true;
      try {
        const data = await apiGet(apiBase.value + '/env');
        if (data.code === 0) {
          items.value = (data.data.items || []).map((it) => ({
            key: it.key,
            label: it.label,
            configured: it.configured,
            masked: it.masked,
            newValue: '',
          }));
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '加载失败。');
        }
      } catch (err) {
        console.error(TAG + ' 加载密钥状态失败: ' + err.message);
        ElementPlus.ElMessage.error('网络错误。');
      }
      loading.value = false;
    }

    // ===== 保存修改（仅提交非空输入） =====
    async function saveKeys() {
      const values = {};
      for (const it of items.value) {
        if (it.newValue && it.newValue.trim()) {
          values[it.key] = it.newValue;
        }
      }
      if (Object.keys(values).length === 0) {
        ElementPlus.ElMessage.warning('请先填写要修改的密钥。');
        return;
      }

      saving.value = true;
      try {
        const data = await apiPut(apiBase.value + '/env', { values });
        if (data.code === 0) {
          ElementPlus.ElMessage.success(data.message || '已保存。');
          await loadKeys();
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '保存失败。');
        }
      } catch (err) {
        console.error(TAG + ' 保存密钥失败: ' + err.message);
        ElementPlus.ElMessage.error('网络错误。');
      }
      saving.value = false;
    }

    Vue.onMounted(() => {
      loadKeys();
      console.log(TAG + ' API 密钥 Tab 已挂载');
    });

    return {
      loading, saving, items, isDark,
      loadKeys, saveKeys,
    };
  },
};
