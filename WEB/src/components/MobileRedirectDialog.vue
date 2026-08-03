<!--
============================================================================
文件名：MobileRedirectDialog.vue（手机端跳转提示全屏弹窗）
文件作用：当手机用户进入电脑端页面时，全屏弹窗询问是否跳转到手机版
        选择"是"→ 父组件跳转对应 /mobile 页面；选择"否"→ 留在电脑版
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <el-dialog
    :model-value="visible"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    width="min(88vw, 380px)"
    top="20vh"
    align-center
    class="mobile-redirect-dialog"
  >
    <!-- 弹窗内容：图标 + 标题 + 说明 + 两个操作按钮 -->
    <div class="flex flex-col items-center text-center px-2 py-2">
      <!-- 手机图标 -->
      <div class="w-16 h-16 rounded-[10px]
                  bg-blue-50 dark:bg-blue-900/20
                  border border-blue-200/60 dark:border-blue-800/40
                  flex items-center justify-center mb-5
                  transition-colors duration-500">
        <svg class="w-8 h-8 text-blue-500 dark:text-blue-400" fill="none"
             stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
          <rect x="7" y="2" width="10" height="20" rx="2.5" stroke-linecap="round"/>
          <path d="M11 18.5h2" stroke-linecap="round"/>
        </svg>
      </div>

      <!-- 标题 -->
      <h2 class="text-lg font-extrabold text-black dark:text-white mb-2
                 transition-colors duration-500">
        是否前往手机版页面？
      </h2>

      <!-- 说明文字（水印级辅助灰字） -->
      <p class="text-[13px] leading-relaxed
                text-gray-400 dark:text-gray-500 mb-7
                transition-colors duration-500">
        手机版已针对小屏优化，做题、刷题与个人中心操作更顺手。
        本会话内仅询问一次。
      </p>

      <!-- 操作按钮 -->
      <div class="w-full space-y-3">
        <el-button
          type="primary"
          size="large"
          class="w-full !rounded-[10px]"
          @click="$emit('confirm')">
          是，前往手机版
        </el-button>
        <el-button
          size="large"
          class="w-full !rounded-[10px]"
          @click="$emit('cancel')">
          否，留在电脑版
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
// ==================== MobileRedirectDialog 逻辑 ====================
// 职责：纯展示组件，可见性由父组件（App.vue）控制

// ========== Props ==========
defineProps({
  /** 是否显示弹窗 */
  visible: { type: Boolean, default: false },
});

// ========== Emits ==========
// confirm：用户选择"是，前往手机版"
// cancel：用户选择"否，留在电脑版"
defineEmits(["confirm", "cancel"]);
</script>

<style scoped>
/* El-dialog 10px 圆角（弹窗卡片） */
.mobile-redirect-dialog :deep(.el-dialog) {
  border-radius: 10px;
}
</style>
