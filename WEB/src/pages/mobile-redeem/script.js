// ==================== 手机端兑换码页面业务逻辑 ====================
// 职责：处理兑换码输入、验证、提交兑换

import { ref, computed, inject } from "vue";
import { redeemCode } from "../../api/redeem";

// 日志前缀
const TAG = "[MobileRedeemPage]";

export default {
  setup() {
    // ===== 注入导航方法（由 App.vue 提供） =====
    const navigate = inject("navigate");
    const navigateBack = inject("goBack", () => navigate("mobile-home"));

    // ===== 表单状态 =====
    const codeInput = ref("");
    const submitting = ref(false);
    const errorMessage = ref("");
    const redeemed = ref(false);
    const redeemedAmount = ref("0");
    const newBalance = ref("0");
    const wasUnlocked = ref(false);

    // ===== 计算属性 =====

    /**
     * 是否允许提交：24 位十六进制（支持连字符）+ 未提交中 + 未兑换成功
     */
    const canSubmit = computed(() => {
      const raw = codeInput.value.replace(/-/g, "").toUpperCase();
      return /^[A-F0-9]{24}$/.test(raw) && !submitting.value && !redeemed.value;
    });

    // ===== 方法 =====

    /** 输入框实时处理：自动转大写并过滤非法字符 */
    function onCodeInput(value) {
      codeInput.value = value.replace(/[^a-fA-F0-9-]/g, "").toUpperCase();
      if (errorMessage.value) errorMessage.value = "";
    }

    /** 提交兑换码 */
    async function submitRedeem() {
      if (!canSubmit.value) return;

      submitting.value = true;
      errorMessage.value = "";

      try {
        const cleanCode = codeInput.value.replace(/-/g, "").toUpperCase();
        const result = await redeemCode(cleanCode);

        if (!result) {
          errorMessage.value = "网络错误，请检查网络连接后重试。";
          submitting.value = false;
          return;
        }

        if (result.code === 0) {
          redeemed.value = true;
          redeemedAmount.value = parseFloat(result.data.amount).toFixed(2);
          newBalance.value = parseFloat(result.data.balance).toFixed(2);
          wasUnlocked.value = result.data.balanceLocked === false;
        } else {
          errorMessage.value = result.message || "兑换失败，请检查兑换码是否正确。";
        }
      } catch (err) {
        console.error(TAG + " 兑换异常: " + (err.message || err));
        errorMessage.value = "网络错误，请稍后重试。";
      }

      submitting.value = false;
    }

    /** 返回上一页 */
    function goBack() {
      navigateBack();
    }

    return {
      codeInput,
      submitting,
      errorMessage,
      redeemed,
      redeemedAmount,
      newBalance,
      wasUnlocked,
      canSubmit,
      onCodeInput,
      submitRedeem,
      goBack,
    };
  },
};
