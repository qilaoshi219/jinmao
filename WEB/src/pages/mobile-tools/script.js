// ==================== 手机端小工具列表页业务逻辑 ====================
// 职责：展示工具卡片列表，点击卡片进入对应工具的移动版独立页面

import { inject } from "vue";

// 日志前缀
const TAG = "[MobileToolsPage]";

export default {
  setup() {
    // 从 App.vue 注入导航方法
    const navigate = inject("navigate");
    const navigateBack = inject("goBack", () => navigate("mobile-home"));

    /** 打开手机端 PDF 分割器独立页面 */
    function openPdfSplitter() {
      console.log(TAG + " 打开手机端 PDF 分割器页面");
      navigate("mobile-tools-pdf-splitter");
    }

    /** 返回上一页 */
    function goBack() {
      navigateBack();
    }

    return {
      openPdfSplitter,
      goBack,
    };
  },
};
