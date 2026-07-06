<!--
============================================================================
文件名：HomeTopbar.vue（首页顶部栏组件）
文件作用：首页右侧主区域顶部固定栏，包含搜索框（骨架占位）、主题切换按钮、用户信息、退出按钮
        遵守设计规范（纯黑纯白文字、10px圆角、500ms过渡、暗黑双轨适配）
============================================================================
-->

<template>
  <!-- 顶部栏容器：固定顶部，毛玻璃效果 -->
  <header class="h-16 sticky top-0 z-10 flex items-center justify-between px-6
                bg-white/85 dark:bg-gray-800/85 backdrop-blur-md
                border-b border-gray-200 dark:border-gray-700
                transition-colors duration-500">

    <!-- ========== 左侧：搜索框（骨架占位） ========== -->
    <div class="flex-1 max-w-md">
      <el-input
        placeholder="搜索教材...（即将上线）"
        disabled
        size="default"
        clearable
      >
        <template #prefix>
          <!-- 搜索图标 -->
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </template>
      </el-input>
    </div>

    <!-- ========== 右侧：操作按钮组 ========== -->
    <div class="flex items-center gap-3 ml-4">
      <!-- 主题切换按钮 -->
      <button
        @click="$emit('toggle-theme')"
        class="p-2 rounded-[10px] bg-gray-100 dark:bg-gray-700
               text-gray-600 dark:text-gray-300
               hover:bg-gray-200 dark:hover:bg-gray-600
               transition-all duration-500"
        :title="isDark ? '切换到亮色模式' : '切换到暗黑模式'"
      >
        <!-- 暗黑模式 → 太阳图标 -->
        <svg v-if="isDark" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
        </svg>
        <!-- 亮色模式 → 月亮图标 -->
        <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
        </svg>
      </button>

      <!-- 用户头像 + 名称 -->
      <div class="flex items-center gap-2">
        <el-avatar :size="32" class="bg-blue-500 dark:bg-blue-400 text-white text-sm flex-shrink-0">
          {{ userInitial }}
        </el-avatar>
        <span class="text-black dark:text-white text-sm font-medium hidden sm:inline
                     transition-colors duration-500">
          {{ userName }}
        </span>
      </div>

      <!-- 退出按钮 -->
      <el-button
        text
        class="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300
               transition-colors duration-500"
        @click="$emit('logout')"
      >
        退出
      </el-button>
    </div>
  </header>
</template>

<script setup>
// ==================== HomeTopbar 逻辑 ====================
// 职责：接收用户信息和主题状态，向上冒泡切换/退出事件

import { computed } from "vue";

// 日志前缀
const TAG = "[HomeTopbar]";
console.log(TAG + " 组件已加载");

// ========== Props ==========
const props = defineProps({
  user: {
    type: Object, // 用户信息对象 { id, nickname, email, ... }
    default: () => ({}),
  },
  isDark: {
    type: Boolean, // 当前是否为暗黑模式
    default: false,
  },
});

// ========== Emits ==========
defineEmits(["toggle-theme", "logout"]);

// ========== 计算属性 ==========

/** 用户头像首字母 */
const userInitial = computed(() => {
  const name = props.user?.nickname || props.user?.email || "用";
  return name.charAt(0).toUpperCase();
});

/** 用户显示名 */
const userName = computed(() => {
  return props.user?.nickname || props.user?.email || "用户";
});
</script>
