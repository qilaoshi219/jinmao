// ==================== 管理后台：消费统计 Tab 组件 ====================
// 职责：平台统计卡片 + 近14天消费趋势折线图 + 调用类型费用分布饼图
// 图表在 Tab 激活时初始化、切走时销毁，监听窗口缩放保持自适应
window.AdminTabs = window.AdminTabs || {};
AdminTabs.stats = {
  name: 'StatsTab',
  props: {
    active: { type: Boolean, default: false },
  },
  setup(props) {
    const { apiGet, apiBase, doLogout, isDark, formatMoney } = AdminShared;
    const TAG = '[AdminStats]';

    // ===== 统计数据 =====
    const statsSummary = Vue.ref({});
    const dailyTrend = Vue.ref([]);
    const callTagDistribution = Vue.ref([]);
    const loadingStats = Vue.ref(false);

    // ===== 图表容器与实例 =====
    const trendEl = Vue.ref(null);
    const pieEl = Vue.ref(null);
    let trendChart = null;
    let pieChart = null;
    let resizeHandler = null;

    // ===== 加载统计数据 =====
    async function loadStats() {
      loadingStats.value = true;
      try {
        const data = await apiGet(apiBase.value + '/stats');
        if (data.code === 0) {
          statsSummary.value = data.data.summary || {};
          dailyTrend.value = data.data.dailyTrend || [];
          callTagDistribution.value = data.data.callTagDistribution || [];
          await Vue.nextTick();
          renderCharts();
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '加载统计数据失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      loadingStats.value = false;
    }

    // ===== 销毁图表实例 =====
    function disposeCharts() {
      if (trendChart) {
        trendChart.dispose();
        trendChart = null;
      }
      if (pieChart) {
        pieChart.dispose();
        pieChart = null;
      }
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }
    }

    // ===== 渲染图表（折线 + 饼图） =====
    function renderCharts() {
      if (!window.echarts) return;

      // 近 14 天消费趋势折线图
      if (trendEl.value) {
        trendChart = echarts.init(trendEl.value);
        trendChart.setOption({
          tooltip: { trigger: 'axis' },
          legend: { data: ['售价', '成本'], top: 0 },
          grid: { left: 60, right: 20, top: 40, bottom: 30 },
          xAxis: { type: 'category', data: dailyTrend.value.map((t) => t.date.substring(5)) },
          yAxis: { type: 'value', name: '金额(元)' },
          series: [{
            name: '售价',
            type: 'line',
            smooth: true,
            areaStyle: { opacity: 0.15 },
            data: dailyTrend.value.map((t) => Number(t.revenue)),
          }, {
            name: '成本',
            type: 'line',
            smooth: true,
            data: dailyTrend.value.map((t) => Number(t.cost)),
          }],
        });
      }

      // 调用类型费用分布饼图
      if (pieEl.value) {
        pieChart = echarts.init(pieEl.value);
        pieChart.setOption({
          tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
          legend: { bottom: 0 },
          series: [{
            name: '调用类型费用',
            type: 'pie',
            radius: ['35%', '65%'],
            data: callTagDistribution.value.map((t) => ({ name: t.label, value: Number(t.cost) })),
          }],
        });
      }

      // 窗口缩放时自适应
      resizeHandler = () => {
        if (trendChart) trendChart.resize();
        if (pieChart) pieChart.resize();
      };
      window.addEventListener('resize', resizeHandler);
    }

    // ===== Tab 激活状态监听：激活加载/重建图表，切走销毁 =====
    Vue.watch(() => props.active, (val) => {
      if (val) {
        if (dailyTrend.value.length === 0) {
          loadStats();
        } else {
          Vue.nextTick(renderCharts);
        }
      } else {
        disposeCharts();
      }
    });

    Vue.onMounted(() => {
      if (props.active) loadStats();
      console.log(TAG + ' 消费统计 Tab 已挂载');
    });

    Vue.onUnmounted(disposeCharts);

    return {
      statsSummary, dailyTrend, callTagDistribution, loadingStats,
      trendEl, pieEl, formatMoney, isDark,
    };
  },
};
