// ==================== 管理后台：应用启动入口 ====================
// 职责：加载全部模板片段 → 注册组件 → 挂载 Vue 应用 → 初始化主题与身份检查
(function () {
  const TAG = '[AdminCMS]';
  const TEMPLATE_NAMES = ['app', 'login', 'shell', 'codes', 'users', 'billing', 'pricing', 'stats', 'security', 'settings', 'apikeys'];

  // ===== 加载全部模板片段（任一失败则整体报错） =====
  async function loadTemplates() {
    const tpls = {};
    for (const name of TEMPLATE_NAMES) {
      const res = await fetch('/admin/static/tpl/' + name + '.html');
      if (!res.ok) throw new Error('模板加载失败: ' + name + ' (HTTP ' + res.status + ')');
      tpls[name] = await res.text();
    }
    return tpls;
  }

  // ===== 启动失败兜底：显示错误提示而非白屏 =====
  function renderBootError(err) {
    console.error(TAG + ' 启动失败: ' + err.message);
    const app = Vue.createApp({
      setup() {
        return { errMsg: err.message };
      },
      template: '<div style="text-align:center;padding:120px 20px;color:#ef4444;font-family:sans-serif;">' +
        '<p style="font-size:20px;font-weight:700;margin-bottom:12px;">管理后台资源加载失败</p>' +
        '<p style="font-size:13px;">' + err.message + '</p>' +
        '<p style="font-size:13px;margin-top:8px;">请刷新页面重试。</p></div>',
    });
    app.mount('#app');
  }

  // ===== 启动入口 =====
  async function boot() {
    let tpls;
    try {
      tpls = await loadTemplates();
    } catch (err) {
      renderBootError(err);
      return;
    }

    const shared = AdminShared;

    // 根组件：登录 / 主界面 / 403 / 校验中 四态切换
    const app = Vue.createApp({
      name: 'AppRoot',
      template: tpls.app,
      setup() {
        return {
          isLoggedIn: shared.isLoggedIn,
          // 共享认证状态为 reactive 对象，需用 computed 包装才能在模板中响应式更新
          isAdmin: Vue.computed(() => shared.auth.isAdmin),
          checkingAdmin: Vue.computed(() => shared.auth.checkingAdmin),
          doLogout: shared.doLogout,
        };
      },
    });

    // 注册组件：将模板文本注入组件定义后注册
    const components = {
      'login-view': Object.assign({}, AdminLogin, { template: tpls.login }),
      'admin-shell': Object.assign({}, AdminShell, { template: tpls.shell }),
      'codes-tab': Object.assign({}, AdminTabs.codes, { template: tpls.codes }),
      'users-tab': Object.assign({}, AdminTabs.users, { template: tpls.users }),
      'billing-tab': Object.assign({}, AdminTabs.billing, { template: tpls.billing }),
      'pricing-tab': Object.assign({}, AdminTabs.pricing, { template: tpls.pricing }),
      'stats-tab': Object.assign({}, AdminTabs.stats, { template: tpls.stats }),
      'security-tab': Object.assign({}, AdminTabs.security, { template: tpls.security }),
      'settings-tab': Object.assign({}, AdminTabs.settings, { template: tpls.settings }),
      'apikeys-tab': Object.assign({}, AdminTabs.apikeys, { template: tpls.apikeys }),
    };
    for (const [name, comp] of Object.entries(components)) {
      app.component(name, comp);
    }

    app.use(ElementPlus);
    app.mount('#app');

    // 初始化主题与管理员身份检查
    shared.initTheme();
    shared.checkAdmin();
    console.log(TAG + ' 管理后台已挂载，后缀: ' + shared.currentSuffix);
  }

  boot();
})();
