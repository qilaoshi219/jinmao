// ==================== 管理后台：账单管理 Tab 组件 ====================
// 职责：全局消费统计卡片、状态/调用类型/用户ID/日期范围筛选、分页记录列表
window.AdminTabs = window.AdminTabs || {};
AdminTabs.billing = {
  name: 'BillingTab',
  setup() {
    const { apiGet, apiBase, doLogout, isDark, formatTime, formatMoney, truncateStr, callTagOptions, callTagLabel } = AdminShared;
    const TAG = '[AdminBilling]';

    // ===== 账单统计 =====
    const billingSummary = Vue.ref({ totalCount: 0, totalRevenue: '0', totalCost: '0', totalProfit: '0', successCount: 0, failedCount: 0 });

    // ===== 筛选条件 =====
    const billStatusFilter = Vue.ref('all');
    const billCallTagFilter = Vue.ref('all');
    const billUserId = Vue.ref('');
    const billDateRange = Vue.ref([]);

    // ===== 账单列表 =====
    const billingList = Vue.ref([]);
    const loadingBilling = Vue.ref(false);
    const billPage = Vue.ref(1);
    const billPageSize = Vue.ref(20);
    const billTotal = Vue.ref(0);

    // ===== 加载账单列表 =====
    async function loadBilling() {
      loadingBilling.value = true;
      try {
        const params = new URLSearchParams({
          page: billPage.value,
          pageSize: billPageSize.value,
          status: billStatusFilter.value || 'all',
          callTag: billCallTagFilter.value || 'all',
          userId: billUserId.value.trim(),
        });
        if (billDateRange.value && billDateRange.value.length === 2) {
          params.set('startDate', billDateRange.value[0]);
          params.set('endDate', billDateRange.value[1]);
        }
        const data = await apiGet(apiBase.value + '/billing?' + params.toString());
        if (data.code === 0) {
          billingList.value = data.data.records || [];
          billTotal.value = data.data.pagination?.total || 0;
          billingSummary.value = data.data.summary || billingSummary.value;
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '加载账单失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      loadingBilling.value = false;
    }

    // ===== 查询（回到第一页） =====
    function searchBilling() {
      billPage.value = 1;
      loadBilling();
    }

    // ===== 重置筛选条件 =====
    function resetFilters() {
      billStatusFilter.value = 'all';
      billCallTagFilter.value = 'all';
      billUserId.value = '';
      billDateRange.value = [];
      billPage.value = 1;
      loadBilling();
    }

    Vue.onMounted(() => {
      loadBilling();
      console.log(TAG + ' 账单管理 Tab 已挂载');
    });

    return {
      billingSummary, billStatusFilter, billCallTagFilter, billUserId, billDateRange,
      billingList, loadingBilling, billPage, billPageSize, billTotal,
      loadBilling, searchBilling, resetFilters,
      formatTime, formatMoney, truncateStr, callTagOptions, callTagLabel, isDark,
    };
  },
};
