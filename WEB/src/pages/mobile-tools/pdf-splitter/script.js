// ==================== 手机端 PDF 分割器页面业务逻辑 ====================
// 职责：独立页面壳，负责返回导航并渲染 PdfSplitterView 组件

import { inject } from "vue";
import PdfSplitterView from "../../../components/PdfSplitterView.vue";

// 日志前缀
const TAG = "[MobilePdfSplitterPage]";

export default {
  components: {
    PdfSplitterView,
  },

  setup() {
    // 从 App.vue 注入返回方法（优先回退到上一个应用内页面，无历史时返回手机首页）
    const navigate = inject("navigate", () => {});
    const goBack = inject("goBack", () => navigate("mobile-home"));

    console.log(TAG + " 手机端 PDF 分割器页面已挂载");

    return {
      goBack,
    };
  },
};
