// ==================== 管理后台：价格调整 Tab 组件 ====================
// 职责：展示/编辑出售价与成本价（DeepSeek LLM / Grsai 文生图 / 火山 TTS / doc2x 分时段单价）、
//       立即保存（写文件即时生效）、创建/取消定时调价
window.AdminTabs = window.AdminTabs || {};
AdminTabs.pricing = {
  name: 'PricingTab',
  setup() {
    const { apiGet, apiPut, apiPost, apiDelete, apiBase, doLogout, isDark, formatTime } = AdminShared;
    const TAG = '[AdminPricing]';

    // ===== 价格配置状态 =====
    const loading = Vue.ref(false);
    const sale = Vue.ref(null);   // { currency, description, timeBasedPricing }
    const cost = Vue.ref(null);
    const savingSale = Vue.ref(false);
    const savingCost = Vue.ref(false);

    // ===== 定时调价状态 =====
    const effectiveAt = Vue.ref('');
    const scheduleNote = Vue.ref('');
    const scheduleList = Vue.ref([]);
    const loadingSchedule = Vue.ref(false);
    const schedulingSale = Vue.ref(false);
    const schedulingCost = Vue.ref(false);

    // ===== 展示配置：全部模型与计费项 =====
    const modelDefs = [
      {
        provider: 'deepseek', providerLabel: 'DeepSeek',
        key: 'deepseek-v4-pro', label: 'deepseek-v4-pro（大模型）',
        fields: [
          { key: 'input_cache_miss', label: '输入单价（缓存未命中，元/百万tokens）' },
          { key: 'input_cache_hit', label: '输入单价（缓存命中，元/百万tokens）' },
          { key: 'output', label: '输出单价（元/百万tokens）' },
        ],
      },
      {
        provider: 'deepseek', providerLabel: 'DeepSeek',
        key: 'deepseek-v4-flash', label: 'deepseek-v4-flash（小模型）',
        fields: [
          { key: 'input_cache_miss', label: '输入单价（缓存未命中，元/百万tokens）' },
          { key: 'input_cache_hit', label: '输入单价（缓存命中，元/百万tokens）' },
          { key: 'output', label: '输出单价（元/百万tokens）' },
        ],
      },
      {
        provider: 'grsai', providerLabel: 'Grsai 文生图',
        key: 'gpt-image-2', label: 'gpt-image-2',
        fields: [{ key: 'per_image', label: '单价（元/张）' }],
      },
      {
        provider: 'grsai', providerLabel: 'Grsai 文生图',
        key: 'gpt-image-2-vip', label: 'gpt-image-2-vip',
        fields: [{ key: 'per_image', label: '单价（元/张）' }],
      },
      {
        provider: 'volcengine', providerLabel: '火山引擎 TTS',
        key: 'seed-tts-2.0', label: 'seed-tts-2.0',
        fields: [{ key: 'per_char', label: '单价（元/字符）' }],
      },
      {
        provider: 'doc2x', providerLabel: 'doc2x PDF解析',
        key: 'doc2x-api-v2', label: 'doc2x-api-v2',
        fields: [{ key: 'per_page', label: '单价（元/页）' }],
      },
    ];

    // 将时段 providers 展平为「计费项」行（仅渲染时段中存在的模型）
    function priceItems(period) {
      const items = [];
      const providers = period.providers || {};
      for (const def of modelDefs) {
        const price = providers[def.provider] && providers[def.provider][def.key];
        if (!price) continue;
        for (const f of def.fields) {
          items.push({
            provider: def.providerLabel,
            model: def.label,
            fieldLabel: f.label,
            fieldKey: f.key,
            price,
          });
        }
      }
      return items;
    }

    // 服务器时区（Asia/Shanghai）实时时钟，用于与计划生效时间对照
    const serverTimeText = Vue.ref(nowText());
    let clockTimer = null;
    let listTimer = null;

    function nowText() {
      return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    }

    function cloneDeep(obj) {
      return JSON.parse(JSON.stringify(obj));
    }

    function sideRef(side) {
      return side === 'sale' ? sale : cost;
    }

    // ===== 加载价格配置 =====
    async function loadAll() {
      loading.value = true;
      try {
        const data = await apiGet(apiBase.value + '/pricing');
        if (data.code === 0) {
          sale.value = data.data.sale;
          cost.value = data.data.cost;
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '加载价格配置失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      loading.value = false;
    }

    // ===== 立即保存（写文件即时生效） =====
    async function saveSide(side, savingRef, label) {
      const ref = sideRef(side);
      if (!ref.value) return;
      savingRef.value = true;
      try {
        const data = await apiPut(apiBase.value + '/pricing', {
          [side]: cloneDeep(ref.value.timeBasedPricing),
        });
        if (data.code === 0) {
          ElementPlus.ElMessage.success(label + '已保存并即时生效。');
          await loadAll();
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || label + '保存失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      savingRef.value = false;
    }

    function saveSale() {
      return saveSide('sale', savingSale, '出售价');
    }

    function saveCost() {
      return saveSide('cost', savingCost, '成本价');
    }

    // ===== 时段增删 =====
    function addPeriod(side) {
      const tbp = sideRef(side).value.timeBasedPricing;
      const defaultPeriod = tbp.periods.find((p) => p.name === 'default');
      const providers = cloneDeep(defaultPeriod ? defaultPeriod.providers : {});
      tbp.periods.push({
        name: '新时段' + (tbp.periods.length + 1),
        start: '08:00',
        end: '18:00',
        providers,
      });
    }

    function removePeriod(side, index) {
      const tbp = sideRef(side).value.timeBasedPricing;
      if (tbp.periods[index].name === 'default') return;
      tbp.periods.splice(index, 1);
    }

    // ===== 定时调价：列表加载 =====
    async function loadSchedules() {
      loadingSchedule.value = true;
      try {
        const data = await apiGet(apiBase.value + '/pricing/schedule');
        if (data.code === 0) {
          scheduleList.value = data.data.items || [];
        } else if (data.code === 401) {
          doLogout();
        }
      } catch (err) {
        console.error(TAG + ' 加载定时调价失败: ' + err.message);
      }
      loadingSchedule.value = false;
    }

    // ===== 定时调价：创建 =====
    async function createSchedule(side) {
      const ref = sideRef(side);
      if (!ref.value) return;
      if (!effectiveAt.value) {
        ElementPlus.ElMessage.warning('请先选择生效时间。');
        return;
      }
      const savingRef = side === 'sale' ? schedulingSale : schedulingCost;
      savingRef.value = true;
      try {
        const data = await apiPost(apiBase.value + '/pricing/schedule', {
          effectiveAt: effectiveAt.value,
          note: scheduleNote.value.trim(),
          [side]: cloneDeep(ref.value.timeBasedPricing),
        });
        if (data.code === 0) {
          ElementPlus.ElMessage.success('定时调价已创建：' + effectiveAt.value);
          effectiveAt.value = '';
          scheduleNote.value = '';
          await loadSchedules();
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '创建定时调价失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
      savingRef.value = false;
    }

    // ===== 定时调价：取消 =====
    async function cancelSchedule(row) {
      try {
        await ElementPlus.ElMessageBox.confirm(
          '确定取消该定时调价吗？取消后到点将不再自动生效。',
          '取消定时调价',
          { type: 'warning', confirmButtonText: '确认取消', cancelButtonText: '再想想' }
        );
      } catch (e) {
        return; // 用户点了“再想想”
      }
      try {
        const data = await apiDelete(apiBase.value + '/pricing/schedule/' + row.id);
        if (data.code === 0) {
          ElementPlus.ElMessage.success('定时调价已取消。');
          await loadSchedules();
        } else if (data.code === 401) {
          doLogout();
        } else {
          ElementPlus.ElMessage.error(data.message || '取消失败。');
        }
      } catch (err) {
        ElementPlus.ElMessage.error('网络错误。');
      }
    }

    Vue.onMounted(() => {
      loadAll();
      loadSchedules();
      clockTimer = setInterval(() => { serverTimeText.value = nowText(); }, 1000);
      listTimer = setInterval(loadSchedules, 30000); // 定时调价到点后自动刷新列表
      console.log(TAG + ' 价格调整 Tab 已挂载');
    });

    Vue.onBeforeUnmount(() => {
      if (clockTimer) clearInterval(clockTimer);
      if (listTimer) clearInterval(listTimer);
    });

    return {
      loading, sale, cost, savingSale, savingCost,
      effectiveAt, scheduleNote, scheduleList, loadingSchedule, schedulingSale, schedulingCost,
      modelDefs, priceItems, serverTimeText, isDark, formatTime,
      loadAll, loadSchedules, saveSale, saveCost,
      addPeriod, removePeriod, createSchedule, cancelSchedule,
    };
  },
};
