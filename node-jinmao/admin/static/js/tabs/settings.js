// ==================== 管理后台：系统设置 Tab 组件 ====================
// 职责：查看安全后缀（脱敏）、修改安全后缀（保存后提示使用新地址）
window.AdminTabs = window.AdminTabs || {};
AdminTabs.settings = {
  name: 'SettingsTab',
  setup() {
    const { apiGet, apiPut, apiBase, doLogout, isDark } = AdminShared;
    const TAG = '[AdminSettings]';

    const configSuffix = Vue.ref('');
    const configSuffixLength = Vue.ref(0);
    const newSuffix = Vue.ref('');
    const updatingSuffix = Vue.ref(false);
    const windowLocation = window.location.origin;

    // ===== 加载系统配置 =====
    async function loadConfig() {
      try {
        const data = await apiGet(apiBase.value + '/config');
        if (data.code === 0) {
          configSuffix.value = data.data.securitySuffix || '***';
          configSuffixLength.value = data.data.suffixLength || 0;
        } else if (data.code === 401) {
          doLogout();
        }
      } catch (err) {
        console.error(TAG + ' 加载配置失败: ' + err.message);
      }
    }

    // ===== 更新安全后缀 =====
    async function updateSuffix() {
      if (!newSuffix.value) {
        ElementPlus.ElMessage.warning('请输入新的安全后缀。');
        return;
      }
      updatingSuffix.value = true;
      try {
        const data = await apiPut(apiBase.value + '/config', { newSuffix: newSuffix.value });
        if (data.code === 0) {
          ElementPlus.ElMessage.success(data.message);
          newSuffix.value = '';
          await loadConfig();
          // 提示用户用新地址访问
          setTimeout(() => {
            ElementPlus.ElMessage({
              message: '请使用新后缀访问: ' + windowLocation + '/admin/' + data.data.newSuffix,
              type: 'warning',
              duration: 10000,
              showClose: true,
            });
          }, 500);
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '修改失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      updatingSuffix.value = false;
    }

    Vue.onMounted(() => {
      loadConfig();
      console.log(TAG + ' 系统设置 Tab 已挂载');
    });

    return {
      configSuffix, configSuffixLength, newSuffix, updatingSuffix, windowLocation,
      loadConfig, updateSuffix, isDark,
    };
  },
};
