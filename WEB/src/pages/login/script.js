// ============================================================================
// 文件名：script.js
// 所属组件：pages/login/index.vue（登录/注册页面）
// 所属目录：src/pages/login/（login 页面的专属文件夹）
// 文件作用：登录注册页面的全部业务逻辑模块
//          通过 export default { setup() } 导出，index.vue 通过
//          <script src="./script.js"> 引用
//          实现了 template(HTML) 和 script(JS) 的完全分离
//
// 实现功能：
//   1. 邮箱格式校验 —— 前端防呆校验，拦截明显非法的邮箱格式
//   2. 发送邮箱验证码 —— 调用后端 smtpcode 接口，发送后启动60s倒计时防重复
//   3. 验证码输入管理 —— 校验6位纯数字格式，回车快捷提交
//   4. 登录/注册提交 —— 调用 Pinia AuthStore 的 login 方法，后端自动判断注册或登录
//   5. UI 状态管理 —— 分拆 isSending / isSubmitting 独立 loading 状态
//   6. 自动聚焦 —— 发送验证码后自动聚焦到验证码输入框
//
// 数据流：
//   用户输入 → email/code(ref) → setup() 内方法 → API/Store → 响应更新视图
//
// 返回给模板的值（setup() 返回值）：
//   @ref       email, code, codeInputRef
//   @ref       isSending, isSubmitting, countdown, message
//   @ref       emailError, codeError
//   @computed  sendCodeButtonText, isProcessing
//   @function  handleSendCode, handleLogin, focusCodeInput
//
// 依赖关系：
//   输入依赖：../../stores/auth（useAuthStore）、../../api/auth（sendCode API）
//   输出给：index.vue 模板（通过 setup() 返回的对象）
//   （路径从 src/pages/login/ 出发，需向上两级到 src/）
//
// 上次修改：2026-07-06（按 design-spec 重构：拆分为 isSending/isSubmitting）
// ============================================================================

import { ref, computed, onMounted } from "vue"; // Vue 3 响应式 API：ref(响应式变量), computed(计算属性), onMounted(生命周期)
import { useAuthStore } from "../../stores/auth"; // Pinia 认证 Store：管理 token、登录状态
import { sendCode } from "../../api/auth"; // 发送验证码的 HTTP API 封装
import { useTheme } from "../../composables/useTheme"; // 主题切换 composable

// ============================================================================
// 一、常量定义
// ============================================================================

// 控制台日志前缀，用于快速定位本组件的日志输出
const TAG = "[LoginPage]";

// 验证码发送后禁止重复点击的倒计时秒数
const COUNTDOWN_SECONDS = 60;

// ============================================================================
// 二、模块默认导出 —— index.vue 通过 <script src="./script.js"> 引用此对象
//    Vue SFC 编译器将 setup() 返回值自动暴露给模板使用
// ============================================================================

export default {
  /**
   * setup() 函数
   * Vue 3 Composition API 入口，在组件实例创建前执行
   *
   * @input 无参数
   * @output {Object} 包含所有模板需要的响应式数据和方法的对象
   *
   * 所有返回的属性都会在模板中直接可用：
   *   - ref 变量：模板中自动解包（无需 .value）
   *   - computed：模板中自动计算
   *   - function：模板中可用 @click="fn" 等方式绑定
   */
  setup() {

    // ========================================================================
    // 三、Pinia Store 实例化
    // ========================================================================

    // 获取认证 Store 实例，提供 login/logout/isLoggedIn/user 等能力
    const authStore = useAuthStore();
    // 主题切换
    const { isDark, toggleTheme } = useTheme();

    // ========================================================================
    // 四、表单响应式数据（ref 包裹，修改后自动触发视图更新）
    // ========================================================================

    /**
     * @ref {string} email
     * 用户输入的邮箱地址字符串，.trim 修饰符自动去除首尾空格
     */
    const email = ref("");

    /**
     * @ref {string} code
     * 用户输入的6位数字验证码
     */
    const code = ref("");

    /**
     * @ref {HTMLInputElement|null} codeInputRef
     * 验证码输入框的 DOM 元素引用，用于发送验证码后自动聚焦
     */
    const codeInputRef = ref(null);

    // ========================================================================
    // 五、UI 状态响应式数据（拆分 loading 为独立状态）
    //    design-spec 规则4：每个异步按钮有独立的 loading 状态
    // ========================================================================

    /**
     * @ref {boolean} isSending
     * 发送验证码按钮的 loading 状态（el-button :loading 绑定此值）
     * true 时按钮显示 loading 动画，自动 disabled
     */
    const isSending = ref(false);

    /**
     * @ref {boolean} isSubmitting
     * 登录/注册按钮的 loading 状态（el-button :loading 绑定此值）
     * true 时按钮显示 loading 动画，自动 disabled
     */
    const isSubmitting = ref(false);

    /**
     * @ref {number} countdown
     * 发送验证码后的倒计时秒数，0 表示可以发送，>0 时按钮显示 "Xs后重发"
     * 每次发送成功后设为 COUNTDOWN_SECONDS，每秒减1直至归零
     */
    const countdown = ref(0);

    /**
     * @ref {{ text: string, type: 'success'|'error'|'info'|'' }} message
     * 提示消息对象
     *   - text: 消息内容字符串，空字符串表示不显示
     *   - type: 消息类型，对应 el-alert 的 type 属性
     */
    const message = ref({ text: "", type: "" });

    /**
     * @var {number|null} countdownTimer
     * 倒计时的定时器 ID，用于在倒计时结束时清除定时器
     * 使用普通变量而非 ref，因为它是纯副作用管理，不需要触发视图更新
     */
    let countdownTimer = null;

    // ========================================================================
    // 六、表单校验错误响应式数据
    // ========================================================================

    /**
     * @ref {string} emailError
     * 邮箱格式校验错误消息，空字符串表示无错误
     */
    const emailError = ref("");

    /**
     * @ref {string} codeError
     * 验证码格式校验错误消息，空字符串表示无错误
     */
    const codeError = ref("");

    // ========================================================================
    // 七、计算属性（依赖 ref 自动派生，值变化时自动重算）
    // ========================================================================

    /**
     * @computed {string} sendCodeButtonText
     * 发送验证码按钮上显示的文字
     *
     * 倒计时 > 0: 返回 "Xs后重发"（X为剩余秒数）
     * 倒计时 = 0: 返回 "发送验证码"
     */
    const sendCodeButtonText = computed(() => {
      if (countdown.value > 0) {
        return countdown.value + "s后重发";
      }
      return "发送验证码";
    });

    /**
     * @computed {boolean} isProcessing
     * 是否正在进行任一网络请求（发送验证码 或 登录）
     *
     * 用途：
     *   - 禁用所有输入框的编辑
     *   - 禁用非当前操作的按钮（防止同时操作）
     *
     * 拆分 isSending 和 isSubmitting 的好处：
     *   - 发送验证码时，只有发送按钮 loading，登录按钮仍可操作
     *   - 登录时，只有登录按钮 loading，发送按钮仍可操作
     *   - 输入框在任一操作进行中都禁用（通过 isProcessing）
     */
    const isProcessing = computed(() => {
      return isSending.value || isSubmitting.value;
    });

    // ========================================================================
    // 八、工具方法
    // ========================================================================

    /**
     * 清除提示消息
     *
     * @name clearMessage
     * @input 无参数
     * @output 将 message.value 重置为 { text: "", type: "" }
     * @side_effect 触发模板中 el-alert 的 v-if 隐藏
     */
    function clearMessage() {
      message.value = { text: "", type: "" };
    }

    /**
     * 校验邮箱格式是否合法
     *
     * @name validateEmail
     * @input 无参数（读取 email.value）
     * @output {boolean}
     *   - true: 邮箱为空或格式正确
     *   - false: 邮箱格式非法，同时设置 emailError 错误消息
     * @side_effect 设置 emailError 响应式变量
     *
     * 规则：非空时必须以 xxx@xxx.xxx 格式（不允许首尾空格、中间空格、缺少@或.等）
     */
    function validateEmail() {
      emailError.value = ""; // 先清除上次的错误提示
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (email.value && !emailRegex.test(email.value)) {
        emailError.value = "请输入正确的邮箱格式";
        return false;
      }
      return true;
    }

    /**
     * 将光标焦点移到验证码输入框
     *
     * @name focusCodeInput
     * @input 无参数
     * @output 无返回值
     * @side_effect 调用 DOM.focus() 使验证码输入框获得焦点
     *
     * 调用时机：发送验证码成功后自动调用，提升用户体验
     */
    function focusCodeInput() {
      if (codeInputRef.value) {
        codeInputRef.value.focus();
      }
    }

    // ========================================================================
    // 九、核心业务方法
    // ========================================================================

    /**
     * 【发送验证码】
     * 调用后端 POST /api/v1/smtpcode 接口，向用户邮箱发送6位验证码
     *
     * @name handleSendCode
     * @async 是异步方法，内部有网络请求
     * @input 无参数（读取 email.value）
     * @output 无返回值（通过 message 响应式变量展示结果）
     * @side_effect
     *   1. 设置 isSending = true（按钮显示 loading 动画，自动 disabled）
     *   2. 调用 sendCode API
     *   3. 成功后：显示绿色成功提示 + 启动60秒倒计时 + 自动聚焦验证码输入框
     *   4. 失败后：显示红色错误提示
     *   5. 最终在 finally 中设置 isSending = false
     *
     * 防重复点击：el-button 的 :loading 属性在 isSending=true 时自动 disabled
     */
    async function handleSendCode() {
      console.log(TAG + "[sendCode] 请求发送验证码");

      // 第一步：校验邮箱格式
      if (!validateEmail()) return;
      clearMessage();

      // 第二步：锁定发送按钮，发起请求
      isSending.value = true;
      try {
        const result = await sendCode(email.value);

        // 第三步：处理响应
        if (result.code === 200) {
          // ===== 发送成功 =====
          message.value = {
            text: "验证码已发送，请查收邮件（若未收到请检查垃圾箱）",
            type: "success",
          };
          console.log(TAG + "[sendCode] 验证码发送成功");

          // 启动60秒倒计时
          countdown.value = COUNTDOWN_SECONDS;
          countdownTimer = setInterval(() => {
            countdown.value--;
            if (countdown.value <= 0) {
              clearInterval(countdownTimer);
              countdownTimer = null;
            }
          }, 1000);

          // 自动聚焦验证码输入框
          focusCodeInput();
        } else {
          // ===== 后端返回业务错误 =====
          // 可能原因：频率限制（5分钟3次）、邮箱格式被拒绝等
          message.value = {
            text: result.message || "发送验证码失败，请稍后重试",
            type: "error",
          };
          console.warn(TAG + "[sendCode] 发送失败: " + result.message);
        }
      } catch (err) {
        // ===== 网络异常或服务器错误 =====
        console.error(TAG + "[sendCode] 异常: " + (err.message || err));
        message.value = {
          text: "网络错误，请检查网络连接后重试",
          type: "error",
        };
      } finally {
        // 第四步：无论成功失败，恢复发送按钮
        isSending.value = false;
      }
    }

    /**
     * 【登录/注册】
     * 调用 Pinia AuthStore 的 login 方法，后端自动判断新用户注册还是老用户登录
     *
     * @name handleLogin
     * @async 是异步方法，内部有网络请求
     * @input 无参数（读取 email.value, code.value）
     * @output 无返回值
     *   - 成功：authStore.isLoggedIn 变为 true → App.vue 自动切换到主页
     *   - 失败：通过 message 显示错误提示
     * @side_effect
     *   1. 设置 isSubmitting = true（按钮显示 loading 动画，自动 disabled）
     *   2. 调用 authStore.login(email, code)
     *   3. 成功后 Store 自动更新 token/user/isLoggedIn，无需手动跳转
     *   4. 失败后显示红色错误提示
     *   5. 最终在 finally 中设置 isSubmitting = false
     *
     * 防重复点击：el-button 的 :loading 属性在 isSubmitting=true 时自动 disabled
     */
    async function handleLogin() {
      console.log(TAG + "[login] 开始登录/注册");

      // 第一步：表单最终校验
      if (!validateEmail()) return;
      if (!/^\d{6}$/.test(code.value)) {
        codeError.value = "请输入6位数字验证码";
        return;
      }
      codeError.value = ""; // 校验通过，清除错误提示
      clearMessage();

      // 第二步：锁定登录按钮，发起登录请求
      isSubmitting.value = true;
      try {
        const result = await authStore.login(email.value, code.value);

        // 第三步：处理响应
        if (result.code === 200) {
          // ===== 登录成功 =====
          // Store 已自动设置 token、user 等状态
          // isLoggedIn 变为 true → App.vue 响应式切换到主页
          const isNewUser = result.data?.is_new_user;
          console.log(
            TAG +
              "[login] 登录成功" +
              (isNewUser ? "（新用户，已自动注册）" : "（老用户）")
          );
        } else {
          // ===== 后端返回业务错误 =====
          // 可能原因：验证码错误、验证码过期、账号被封禁等
          message.value = {
            text: result.message || "登录失败，请检查验证码是否正确",
            type: "error",
          };
          console.warn(TAG + "[login] 登录失败: " + result.message);
        }
      } catch (err) {
        // ===== 网络异常或服务器错误 =====
        console.error(TAG + "[login] 异常: " + (err.message || err));
        message.value = {
          text: "网络错误，请检查网络连接后重试",
          type: "error",
        };
      } finally {
        // 第四步：无论成功失败，恢复登录按钮
        isSubmitting.value = false;
      }
    }

    // ========================================================================
    // 十、返回模板所需的所有响应式数据和方法
    //     这些值会被 Vue SFC 编译器自动绑定到模板上下文
    // ========================================================================

    console.log(TAG + " 登录注册页面组件已初始化（NERV 设计重构版）");

    // ========================================================================
    // 十一、生命周期 — 绑定主题切换按钮
    // ========================================================================
    onMounted(() => {
      const btn = document.getElementById("theme-toggle");
      if (btn) { btn.addEventListener("click", () => toggleTheme()); }
    });

    return {
      // --- 主题 ---
      isDark,
      toggleTheme,

      // --- 表单数据 ---
      email,
      code,
      codeInputRef,

      // --- UI 状态（拆分为独立 loading 状态，符合规则4） ---
      isSending,     // 发送验证码按钮 loading
      isSubmitting,  // 登录按钮 loading
      countdown,     // 倒计时秒数
      message,       // 提示消息（供 el-alert 使用）

      // --- 校验错误 ---
      emailError,
      codeError,

      // --- 计算属性 ---
      sendCodeButtonText,  // 按钮文字（发送验证码 / Xs后重发）
      isProcessing,        // 是否正在处理任一请求（禁用输入框）

      // --- 方法（供模板事件绑定使用） ---
      handleSendCode,
      handleLogin,
      focusCodeInput,
    };
  },
};
