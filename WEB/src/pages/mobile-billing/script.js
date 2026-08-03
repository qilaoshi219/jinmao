// ==================== 手机端账单页面业务逻辑 ====================
// 职责：加载账单数据、分页、格式化日期/金额、返回手机首页导航
// 遵循项目现有页面模式：export default { setup() { ... } }

import { ref, computed, onMounted, inject } from "vue";
import { getBilling } from "../../api/billing";

// 日志前缀
const TAG = "[mobile_billing_page]";

export default {
  setup() {
    // ========== 依赖注入 ==========
    const navigate = inject("navigate");
    const navigateBack = inject("goBack", () => navigate("mobile-home"));

    // ========== 响应式数据 ==========
    const loading = ref(true);
    const error = ref(null);

    // 账务摘要
    const vipLevel = ref("free");
    const plan = ref(null);
    const balance = ref("0");
    const balanceLocked = ref(false);
    const totalUsed = ref("0");

    // 扣费记录与分页
    const records = ref([]);
    const pagination = ref({ page: 1, pageSize: 20, total: 0 });
    const currentPage = ref(1);

    // 充值记录与分页
    const rechargeRecords = ref([]);
    const rechargePagination = ref({ page: 1, pageSize: 20, total: 0 });
    const rechargePage = ref(1);

    // 记录明细选项卡：consume=消费记录，recharge=充值记录
    const activeTab = ref("consume");

    // ========== 计算属性 ==========

    /** VIP 等级中文标签映射 */
    const vipLevelLabel = computed(() => {
      const map = { free: "免费用户", vip1: "VIP 1", vip2: "VIP 2", vip3: "VIP 3" };
      return map[vipLevel.value] || vipLevel.value;
    });

    /** 开通计划中文标签映射 */
    const planLabel = computed(() => {
      const map = { basic: "基础版", pro: "专业版" };
      if (!plan.value) return "未开通";
      return map[plan.value] || plan.value;
    });

    /** 格式化后的余额 */
    const formattedBalance = computed(() => parseFloat(balance.value).toFixed(2));

    /** 格式化后的已使用金额 */
    const formattedTotalUsed = computed(() => parseFloat(totalUsed.value).toFixed(2));

    // ========== 方法 ==========

    /**
     * 加载账单数据
     */
    async function loadData(page = 1, rpage = 1) {
      loading.value = true;
      error.value = null;
      try {
        const res = await getBilling(page, pagination.value.pageSize, rpage, rechargePagination.value.pageSize);
        if (res.code !== 0) {
          error.value = res.message || "获取账单信息失败";
          return;
        }

        const data = res.data;
        vipLevel.value = data.vipLevel;
        plan.value = data.plan;
        balance.value = data.balance;
        balanceLocked.value = data.balanceLocked || false;
        totalUsed.value = data.totalUsed;

        records.value = data.records;
        pagination.value = data.pagination;
        currentPage.value = data.pagination.page;

        rechargeRecords.value = data.rechargeRecords || [];
        rechargePagination.value = data.rechargePagination || { page: 1, pageSize: 20, total: 0 };
        rechargePage.value = (data.rechargePagination || {}).page || 1;
      } catch (err) {
        console.error(TAG + " 账单数据加载异常: " + err.message);
        error.value = "网络请求失败，请检查网络连接后重试。";
      } finally {
        loading.value = false;
      }
    }

    function handlePageChange(newPage) {
      loadData(newPage, rechargePage.value);
    }

    function handleRechargePageChange(newPage) {
      loadData(currentPage.value, newPage);
    }

    function goBack() {
      navigateBack();
    }

    /** 跳转到手机端兑换码页面 */
    function goRedeem() {
      navigate("mobile-redeem");
    }

    /** 格式化日期为 YYYY-MM-DD */
    function formatDate(dateStr) {
      if (!dateStr) return "-";
      try {
        const d = new Date(dateStr);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      } catch {
        return dateStr;
      }
    }

    /** 格式化费用为 5 位小数显示 */
    function formatCost(costStr) {
      return parseFloat(costStr).toFixed(5);
    }

    // ========== 生命周期 ==========
    onMounted(() => {
      loadData(1);
    });

    // ========== 返回给模板 ==========
    return {
      loading,
      error,
      vipLevel,
      plan,
      balance,
      balanceLocked,
      totalUsed,
      records,
      pagination,
      currentPage,
      rechargeRecords,
      rechargePagination,
      rechargePage,
      activeTab,
      vipLevelLabel,
      planLabel,
      formattedBalance,
      formattedTotalUsed,
      loadData,
      handlePageChange,
      handleRechargePageChange,
      goRedeem,
      goBack,
      formatDate,
      formatCost,
    };
  },
};
