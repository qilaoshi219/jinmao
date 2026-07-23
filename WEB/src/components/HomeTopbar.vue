<!--
============================================================================
文件名：HomeTopbar.vue（首页顶部栏 — NERV 蓝色战术风格）
文件作用：首页主区域顶部固定栏，NERV 冷峻战术美学风格
        遵守设计规范（纯黑纯白文字、10px圆角、500ms过渡、暗黑双轨适配）
============================================================================
-->

<template>
  <!-- NERV 蓝色战术风格顶部栏：h-12 / CSS变量双轨 / 500ms过渡 -->
  <header class="h-12 sticky top-0 z-10 flex items-center justify-between px-5
                bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]
                transition-colors duration-500">

    <!-- 左侧：蓝色文字标签 + 12px下划线 -->
    <div class="flex-shrink-0 flex flex-col items-start gap-[2px]">
      <span class="font-mono text-[11px] tracking-[0.15em] text-blue-500 dark:text-blue-400">
        金毛 · 自学空间
      </span>
      <div class="w-[12px] h-[2px] bg-blue-500 dark:bg-blue-400 rounded-full"></div>
    </div>

    <!-- 中间：搜索框 — 透明背景 + 聚焦蓝色边框 -->
    <div class="flex-1 max-w-[480px] min-w-0 mx-8">
      <el-input placeholder="搜索教材..." size="small" clearable class="nerv-search-input">
        <template #prefix>
          <svg class="w-[16px] h-[16px] text-gray-400 dark:text-gray-500"
               fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </template>
      </el-input>
    </div>

    <!-- 右侧：主题切换 + 用户头像下拉菜单 -->
    <div class="flex items-center gap-3 flex-shrink-0">

      <!-- 主题切换按钮 -->
      <button
        @click="$emit('toggle-theme')"
        class="w-8 h-8 rounded-[10px] flex items-center justify-center
               text-gray-500 dark:text-gray-400 cursor-pointer
               hover:text-blue-500 dark:hover:text-blue-400
               hover:bg-blue-50 dark:hover:bg-blue-900/20
               transition-colors duration-500"
        :title="isDark ? '切换到亮色模式' : '切换到暗黑模式'"
      >
        <svg v-if="isDark" class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
        </svg>
        <svg v-else class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
        </svg>
      </button>

      <!-- 用户头像下拉菜单 -->
      <div class="relative">
        <button
          @click="showUserMenu = !showUserMenu"
          class="w-8 h-8 rounded-full flex items-center justify-center
                 bg-blue-500 dark:bg-blue-400 text-white text-xs font-bold
                 hover:shadow-md hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-600/50
                 transition-all duration-500 cursor-pointer"
          title="用户菜单"
        >
          {{ userInitial }}
        </button>

        <!-- 下拉菜单：昵称 + 邮箱 + 退出登录 -->
        <div
          v-if="showUserMenu"
          class="absolute right-0 top-full mt-2 w-48 rounded-[10px]
                 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                 shadow-lg dark:shadow-[0_18px_45px_rgba(0,0,0,0.35)]
                 overflow-hidden z-10 transition-all duration-500"
        >
          <div class="px-4 pt-3 pb-2.5 border-b border-gray-100 dark:border-gray-700/60">
            <div class="text-sm font-semibold text-black dark:text-white truncate">{{ userName }}</div>
            <div v-if="user.email" class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
              {{ user.email }}
            </div>
          </div>
          <button
            class="w-full text-left px-4 py-2.5 text-[13px]
                   text-red-500 dark:text-red-400
                   hover:bg-red-50 dark:hover:bg-red-900/20
                   transition-colors duration-200"
            @click="handleLogout"
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
// ==================== HomeTopbar 逻辑 ====================
// 职责：接收用户信息和主题状态，向上冒泡切换/退出事件

import { ref, computed } from "vue";

const TAG = "[HomeTopbar]";
console.log(TAG + " 组件已加载");

// ========== Props ==========
const props = defineProps({
  user: { type: Object, default: () => ({}) },
  isDark: { type: Boolean, default: false },
});

// ========== Emits ==========
const emit = defineEmits(["toggle-theme", "logout"]);

// ========== 响应式状态 ==========
const showUserMenu = ref(false);

// ========== 计算属性 ==========
const userInitial = computed(() => {
  const name = props.user?.nickname || props.user?.email || "用";
  return name.charAt(0).toUpperCase();
});

const userName = computed(() => {
  return props.user?.nickname || props.user?.email || "用户";
});

// ========== 方法 ==========
function handleLogout() {
  showUserMenu.value = false;
  console.log(TAG + " 用户退出登录");
  emit("logout");
}
</script>

<style scoped>
/*
 * NERV 搜索框样式 — 透明背景 + 聚焦蓝色边框
 * :deep() 穿透 Element Plus 组件内部覆盖默认样式
 */
.nerv-search-input :deep(.el-input__wrapper) {
  background-color: transparent !important;
  box-shadow: none !important;
  border-color: var(--color-border);
  border-radius: 10px;
  transition: border-color 500ms ease;
}
/* 悬停 / 聚焦 → 蓝色边框 */
.nerv-search-input :deep(.el-input__wrapper:hover),
.nerv-search-input :deep(.el-input__wrapper.is-focus) {
  border-color: #409eff;
}
.dark .nerv-search-input :deep(.el-input__wrapper:hover),
.dark .nerv-search-input :deep(.el-input__wrapper.is-focus) {
  border-color: #60a5fa;
}
/* 输入文字颜色双轨适配 */
.nerv-search-input :deep(.el-input__inner) { color: #000000; }
.dark .nerv-search-input :deep(.el-input__inner) { color: #ffffff; }
/* 清除按钮颜色适配 */
.nerv-search-input :deep(.el-input__suffix .el-icon) { color: #9ca3af; }
.dark .nerv-search-input :deep(.el-input__suffix .el-icon) { color: #6b7280; }
</style>
