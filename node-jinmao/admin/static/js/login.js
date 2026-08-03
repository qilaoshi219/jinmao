// ==================== 管理后台：登录视图组件 ====================
// 职责：邮箱验证码登录表单（发送验证码、登录、倒计时）
// 登录成功后写入共享认证状态并触发管理员身份检查
window.AdminLogin = {
  name: 'LoginView',
  setup() {
    const { auth, checkAdmin, isDark } = AdminShared;
    const TAG = '[AdminLogin]';

    // ===== 登录表单 =====
    const loginEmail = Vue.ref('');
    const loginCode = Vue.ref('');
    const loginLoading = Vue.ref(false);
    const loginError = Vue.ref('');
    const sendCodeCooldown = Vue.ref(0);
    let cooldownTimer = null;

    // ===== 发送验证码 =====
    async function sendLoginCode() {
      if (!loginEmail.value) {
        loginError.value = '请输入邮箱地址。';
        return;
      }
      loginError.value = '';
      try {
        const res = await fetch('/api/v1/smtpcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginEmail.value, usage: 'login' }),
        });
        const data = await res.json();
        if (data.code !== 0) {
          loginError.value = data.message || '发送验证码失败。';
          return;
        }
        // 开始倒计时
        sendCodeCooldown.value = 60;
        cooldownTimer = setInterval(() => {
          sendCodeCooldown.value--;
          if (sendCodeCooldown.value <= 0) {
            clearInterval(cooldownTimer);
            cooldownTimer = null;
          }
        }, 1000);
        loginError.value = '';
        ElementPlus.ElMessage.success('验证码已发送，请查收邮箱。');
      } catch (err) {
        loginError.value = '网络错误，请检查网络连接。';
      }
    }

    // ===== 登录 =====
    async function doLogin() {
      if (!loginEmail.value || !loginCode.value) {
        loginError.value = '请输入邮箱和验证码。';
        return;
      }
      loginLoading.value = true;
      loginError.value = '';
      try {
        const res = await fetch('/api/v1/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginEmail.value, code: loginCode.value }),
        });
        const data = await res.json();
        if (data.code !== 200) {
          loginError.value = data.message || '登录失败。';
          loginLoading.value = false;
          return;
        }
        // 登录成功，保存 token 并检查管理员身份
        auth.token = data.data.token;
        localStorage.setItem('token', data.data.token);
        loginLoading.value = false;
        loginError.value = '';
        console.log(TAG + ' 登录成功');
        await checkAdmin();
      } catch (err) {
        loginError.value = '网络错误，请检查网络连接。';
        loginLoading.value = false;
      }
    }

    // 组件卸载时清理倒计时定时器
    Vue.onUnmounted(() => {
      if (cooldownTimer) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    });

    return {
      loginEmail, loginCode, loginLoading, loginError, sendCodeCooldown,
      sendLoginCode, doLogin, isDark,
    };
  },
};
