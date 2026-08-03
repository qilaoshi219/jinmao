// ==================== 管理后台：用户管理 Tab 组件 ====================
// 职责：用户统计卡片、搜索/筛选、分页列表、禁用（填写原因+确认）、解禁
window.AdminTabs = window.AdminTabs || {};
AdminTabs.users = {
  name: 'UsersTab',
  setup() {
    const { apiGet, apiPut, apiBase, doLogout, isDark, formatTime, vipType, vipLabel } = AdminShared;
    const TAG = '[AdminUsers]';

    // ===== 用户统计 =====
    const userSummary = Vue.ref({ total: 0, banned: 0, admins: 0, todayNew: 0 });

    // ===== 筛选条件 =====
    const keyword = Vue.ref('');
    const roleFilter = Vue.ref('all');
    const bannedFilter = Vue.ref('all');

    // ===== 用户列表 =====
    const userList = Vue.ref([]);
    const loadingUsers = Vue.ref(false);
    const userPage = Vue.ref(1);
    const userPageSize = Vue.ref(20);
    const userTotal = Vue.ref(0);
    const operatingId = Vue.ref('');

    // ===== 加载用户列表 =====
    async function loadUsers() {
      loadingUsers.value = true;
      try {
        const params = new URLSearchParams({
          page: userPage.value,
          pageSize: userPageSize.value,
          keyword: keyword.value.trim(),
          role: roleFilter.value || 'all',
          banned: bannedFilter.value || 'all',
        });
        const data = await apiGet(apiBase.value + '/users?' + params.toString());
        if (data.code === 0) {
          userList.value = data.data.users || [];
          userTotal.value = data.data.pagination?.total || 0;
          userSummary.value = data.data.summary || userSummary.value;
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '加载用户列表失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      loadingUsers.value = false;
    }

    // ===== 查询（回到第一页） =====
    function searchUsers() {
      userPage.value = 1;
      loadUsers();
    }

    // ===== 重置筛选条件 =====
    function resetFilters() {
      keyword.value = '';
      roleFilter.value = 'all';
      bannedFilter.value = 'all';
      userPage.value = 1;
      loadUsers();
    }

    // ===== 禁用用户（填写原因 + 二次确认） =====
    async function banUser(row) {
      let reason = '';
      try {
        const res = await ElementPlus.ElMessageBox.prompt(
          '请填写禁用原因（将展示给用户并记录在案）',
          '禁用用户 ' + row.email,
          {
            confirmButtonText: '确认禁用',
            cancelButtonText: '取消',
            type: 'warning',
            inputValidator: (v) => (v && v.trim()) ? true : '禁用原因不能为空',
          }
        );
        reason = res.value.trim();
      } catch (e) {
        return; // 用户取消
      }
      operatingId.value = row.id;
      try {
        const data = await apiPut(apiBase.value + '/users/' + row.id + '/ban', { reason });
        if (data.code === 0) {
          ElementPlus.ElMessage.success(data.message);
          await loadUsers();
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '禁用失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      operatingId.value = '';
    }

    // ===== 解禁用户（二次确认） =====
    async function unbanUser(row) {
      try {
        await ElementPlus.ElMessageBox.confirm(
          '确定解禁用户 ' + row.email + ' 吗？解禁后该用户可正常使用平台。',
          '解禁用户',
          { confirmButtonText: '确认解禁', cancelButtonText: '取消', type: 'info' }
        );
      } catch (e) {
        return; // 用户取消
      }
      operatingId.value = row.id;
      try {
        const data = await apiPut(apiBase.value + '/users/' + row.id + '/unban', {});
        if (data.code === 0) {
          ElementPlus.ElMessage.success(data.message);
          await loadUsers();
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '解禁失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      operatingId.value = '';
    }

    Vue.onMounted(() => {
      loadUsers();
      console.log(TAG + ' 用户管理 Tab 已挂载');
    });

    return {
      userSummary, keyword, roleFilter, bannedFilter,
      userList, loadingUsers, userPage, userPageSize, userTotal, operatingId,
      loadUsers, searchUsers, resetFilters, banUser, unbanUser,
      formatTime, vipType, vipLabel, isDark,
    };
  },
};
