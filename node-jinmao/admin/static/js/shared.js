// ==================== 管理后台：共享状态与工具 ====================
// 职责：认证状态、API 请求封装、通用格式化函数、主题切换、展示辅助映射
// 通过 window.AdminShared 全局命名空间暴露，供各模块组件使用
(function () {
  const TAG = '[AdminShared]';

  // ===== 认证状态（Vue reactive，跨组件共享） =====
  const auth = Vue.reactive({
    token: localStorage.getItem('token') || null,
    isAdmin: false,
    adminEmail: '',
    checkingAdmin: true,
  });
  const isLoggedIn = Vue.computed(() => !!auth.token);

  // ===== 从 URL 提取当前安全后缀 =====
  let currentSuffix = '';
  try {
    const pathParts = window.location.pathname.split('/');
    currentSuffix = pathParts[pathParts.length - 1] || '';
  } catch (e) {
    currentSuffix = '';
  }
  const apiBase = Vue.computed(() => '/admin/' + currentSuffix + '/api');

  // ===== API 请求封装（自动附带 Bearer Token） =====
  function authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (auth.token) headers['Authorization'] = 'Bearer ' + auth.token;
    return headers;
  }

  async function apiGet(url) {
    const res = await fetch(url, { headers: authHeaders() });
    return res.json();
  }

  async function apiPost(url, body) {
    const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
    return res.json();
  }

  async function apiPut(url, body) {
    const res = await fetch(url, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
    return res.json();
  }

  async function apiDelete(url) {
    const res = await fetch(url, { method: 'DELETE', headers: authHeaders() });
    return res.json();
  }

  // ===== 退出登录 =====
  function doLogout() {
    auth.token = null;
    localStorage.removeItem('token');
    auth.isAdmin = false;
    auth.adminEmail = '';
    console.log(TAG + ' 已退出登录');
  }

  // ===== 检查管理员身份（页面加载与登录成功后调用） =====
  async function checkAdmin() {
    if (!auth.token) {
      auth.checkingAdmin = false;
      return;
    }
    auth.checkingAdmin = true;
    try {
      const res = await fetch('/api/v1/auth/profile', { headers: { 'Authorization': 'Bearer ' + auth.token } });
      const data = await res.json();
      if (data.code === 200 && data.data) {
        auth.adminEmail = data.data.email || '';
        auth.isAdmin = data.data.role === 'admin';
        console.log(TAG + ' 管理员检查: role=' + data.data.role + ', isAdmin=' + auth.isAdmin);
      } else {
        doLogout();
      }
    } catch (err) {
      console.error(TAG + ' 管理员检查失败: ' + err.message);
      auth.isAdmin = false;
    }
    auth.checkingAdmin = false;
  }

  // ===== 通用格式化工具 =====
  function formatTime(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function truncateStr(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === '') return '0.00';
    return Number(value).toFixed(2);
  }

  // ===== 主题切换（暗黑模式） =====
  const isDark = Vue.ref(false);

  function applyTheme() {
    if (isDark.value) {
      document.body.classList.add('dark');
      localStorage.setItem('admin_theme', 'dark');
    } else {
      document.body.classList.remove('dark');
      localStorage.setItem('admin_theme', 'light');
    }
  }

  function toggleTheme() {
    isDark.value = !isDark.value;
    applyTheme();
  }

  function initTheme() {
    if (localStorage.getItem('admin_theme') === 'dark') {
      isDark.value = true;
      document.body.classList.add('dark');
    }
  }

  // ===== 攻击类型映射（安全防护 Tab 筛选下拉与表格展示） =====
  const attackTypeOptions = [
    { value: 'sql_injection', label: 'SQL注入' },
    { value: 'xss', label: 'XSS攻击' },
    { value: 'path_traversal', label: '路径遍历' },
    { value: 'oversized_url', label: '超长URL' },
    { value: 'path_param_abuse', label: '参数滥用' },
    { value: 'sensitive_file', label: '敏感文件' },
    { value: 'scanner_path', label: '扫描路径' },
    { value: 'malicious_ua', label: '恶意UA' },
  ];

  function attackTypeLabel(type) {
    const found = attackTypeOptions.find((t) => t.value === type);
    return found ? found.label : (type || '未知');
  }

  function severityType(sev) {
    if (sev === 'high') return 'danger';
    if (sev === 'medium') return 'warning';
    return 'info';
  }

  function severityLabel(sev) {
    if (sev === 'high') return '高危';
    if (sev === 'medium') return '中危';
    return '低危';
  }

  function blockedLabel(blocked) {
    return blocked ? '已阻断' : '放行';
  }

  function blockedType(blocked) {
    return blocked ? 'danger' : 'success';
  }

  // ===== 调用类型映射（账单管理 Tab） =====
  const callTagOptions = [
    { value: 'all', label: '全部类型' },
    { value: 'elaboration', label: '口播稿扩写' },
    { value: 'outline', label: '大纲生成' },
    { value: 'title', label: '标题生成' },
    { value: 'getline', label: '行号识别' },
    { value: 'htmlppt', label: 'HTML PPT 生成' },
    { value: 'create_image', label: '文生图' },
    { value: 'tts', label: '文本转语音' },
    { value: 'doc2x', label: 'PDF解析' },
    { value: 'md2quiz_split', label: '题库分段(AI)' },
    { value: 'md2quiz_format', label: '题库格式化(AI)' },
    { value: 'md2quiz_generate', label: '题库生成(AI)' },
  ];

  function callTagLabel(tag) {
    const found = callTagOptions.find((t) => t.value === tag);
    return found ? found.label : (tag || '未知');
  }

  // ===== VIP 等级映射（用户管理 Tab） =====
  function vipType(level) {
    if (level === 'vip1') return 'warning';
    if (level === 'vip2') return 'success';
    if (level === 'vip3') return 'danger';
    return 'info';
  }

  function vipLabel(level) {
    const map = { free: '免费', vip1: 'VIP1', vip2: 'VIP2', vip3: 'VIP3' };
    return map[level] || level || '免费';
  }

  // ===== 导出全局命名空间 =====
  window.AdminShared = {
    auth, isLoggedIn, currentSuffix, apiBase,
    apiGet, apiPost, apiPut, apiDelete, doLogout, checkAdmin,
    formatTime, truncateStr, formatMoney,
    isDark, toggleTheme, initTheme,
    attackTypeOptions, attackTypeLabel, severityType, severityLabel, blockedLabel, blockedType,
    callTagOptions, callTagLabel, vipType, vipLabel,
  };
})();
