// ==================== 账单页面业务逻辑 ====================
// 职责：加载账单数据、分页、格式化日期/金额、返回首页导航
// 遵循项目现有页面模式：export default { setup() { ... } }

import { ref, computed, onMounted, inject } from "vue";
import { getBilling } from "../../api/billing"; // 账单 API（充值已迁移到兑换码系统）

// 日志前缀
const TAG = "[billing_page]";

export default {
  setup() {
    // ========== 依赖注入：获取导航函数 ==========
    const navigate = inject("navigate"); // App.vue 提供的页面跳转函数
    // 返回上一页函数（从 App.vue 注入，无应用内历史时兜底回首页）
    const navigateBack = inject("goBack", () => navigate("home"));

    // ========== 响应式数据 ==========
    const loading = ref(true);          // 加载中状态
    const error = ref(null);            // 错误信息

    // 账务摘要
    const vipLevel = ref("free");       // VIP 等级
    const plan = ref(null);             // 开通计划
    const balance = ref("0");           // 余额（字符串）
    const balanceLocked = ref(false);   // 余额锁定状态
    const totalUsed = ref("0");         // 已使用金额（字符串）



    // 扣费记录与分页
    const records = ref([]);            // 当前页扣费记录列表
    const pagination = ref({            // 分页信息
      page: 1,
      pageSize: 20,
      total: 0,
    });
    const currentPage = ref(1);         // el-pagination 绑定的当前页

    // 充值记录与分页（独立于扣费记录分页）
    const rechargeRecords = ref([]);    // 当前页充值记录列表
    const rechargePagination = ref({    // 充值记录分页信息
      page: 1,
      pageSize: 20,
      total: 0,
    });
    const rechargePage = ref(1);        // 充值记录 el-pagination 绑定的当前页

    // 记录明细选项卡：consume=消费记录，recharge=充值记录
    const activeTab = ref("consume");

    // ========== 计算属性 ==========

    /** VIP 等级中文标签映射 */
    const vipLevelLabel = computed(() => {
      const map = {
        free: "免费用户",
        vip1: "VIP 1",
        vip2: "VIP 2",
        vip3: "VIP 3",
      };
      return map[vipLevel.value] || vipLevel.value;
    });

    /** 开通计划中文标签映射 */
    const planLabel = computed(() => {
      const map = {
        basic: "基础版",
        pro: "专业版",
      };
      if (!plan.value) return "未开通";
      return map[plan.value] || plan.value;
    });

    /** 格式化后的余额（保留 2 位小数，用于页面显示） */
    const formattedBalance = computed(() => {
      return parseFloat(balance.value).toFixed(2);
    });

    /** 格式化后的已使用金额（保留 2 位小数） */
    const formattedTotalUsed = computed(() => {
      return parseFloat(totalUsed.value).toFixed(2);
    });

    // ========== 方法 ==========

    /**
     * 加载账单数据
     * @param {number} page - 扣费记录页码
     * @param {number} rpage - 充值记录页码
     */
    async function loadData(page = 1, rpage = 1) {
      loading.value = true;
      error.value = null;
      console.log(TAG + " 开始加载账单数据，page=" + page + ", rechargePage=" + rpage);

      try {
        const res = await getBilling(page, pagination.value.pageSize, rpage, rechargePagination.value.pageSize);

        if (res.code !== 0) {
          error.value = res.message || "获取账单信息失败";
          console.error(TAG + " 账单数据加载失败: " + error.value);
          return;
        }

        const data = res.data;
        // 更新账务摘要
        vipLevel.value = data.vipLevel;
        plan.value = data.plan;
        balance.value = data.balance;
        balanceLocked.value = data.balanceLocked || false;
        totalUsed.value = data.totalUsed;

        // 更新扣费记录和分页
        records.value = data.records;
        pagination.value = data.pagination;
        currentPage.value = data.pagination.page;

        // 更新充值记录和分页
        rechargeRecords.value = data.rechargeRecords || [];
        rechargePagination.value = data.rechargePagination || { page: 1, pageSize: 20, total: 0 };
        rechargePage.value = (data.rechargePagination || {}).page || 1;

        console.log(TAG + " 账单数据加载完成：扣费记录共 " + pagination.value.total +
          " 条，充值记录共 " + rechargePagination.value.total + " 条");
      } catch (err) {
        console.error(TAG + " 账单数据加载异常: " + err.message);
        error.value = "网络请求失败，请检查网络连接后重试。";
      } finally {
        loading.value = false;
      }
    }

    /**
     * 分页切换回调
     * @param {number} newPage - 新页码
     */
    function handlePageChange(newPage) {
      console.log(TAG + " 分页切换: page=" + newPage);
      loadData(newPage, rechargePage.value);
    }

    /**
     * 充值记录分页切换回调
     * @param {number} newPage - 新页码
     */
    function handleRechargePageChange(newPage) {
      console.log(TAG + " 充值记录分页切换: rechargePage=" + newPage);
      loadData(currentPage.value, newPage);
    }

    /** 返回上一页 */
    function goBack() {
      console.log(TAG + " 返回上一页");
      navigateBack();
    }

    /**
     * 跳转到兑换码输入页面
     * 充值功能已迁移到兑换码系统，用户通过点击"去兑换码"按钮进入兑换码领取页面
     */
    function goRedeem() {
      console.log(TAG + " 点击去兑换码，跳转兑换码页面");
      navigate("redeem");
    }

    /**
     * 格式化日期为 YYYY-MM-DD 格式
     * @param {string} dateStr - ISO 日期字符串
     * @returns {string} 格式化后的日期
     */
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

    /**
     * 格式化费用为 2 位小数显示
     * @param {string} costStr - 费用字符串（7 位小数）
     * @returns {string} 格式化后的费用
     */
    function formatCost(costStr) {
      return parseFloat(costStr).toFixed(2);
    }

    // ========== 生命周期 ==========
    onMounted(() => {
      console.log(TAG + " 账单页面已挂载");
      loadData(1);
    });

    // ========== 返回给模板 ==========
    return {
      // 状态
      loading,
      error,
      // 充值功能已迁移到兑换码系统，recharging 状态保留用于兼容
      // 账务摘要
      vipLevel,
      plan,
      balance,
      balanceLocked,
      totalUsed,
      // 扣费记录
      records,
      pagination,
      currentPage,
      // 充值记录
      rechargeRecords,
      rechargePagination,
      rechargePage,
      // 选项卡
      activeTab,
      // 计算属性
      vipLevelLabel,
      planLabel,
      formattedBalance,
      formattedTotalUsed,
      // 方法
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
