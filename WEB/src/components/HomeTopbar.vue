<!--
============================================================================
文件名：HomeTopbar.vue（首页顶部栏组件）
文件作用：首页右侧主区域顶部固定栏
        参考老项目布局：搜索框 + 通知铃铛 + 用户下拉菜单 + 主题切换
        遵守设计规范（纯黑纯白文字、10px圆角、500ms过渡、暗黑双轨适配）
============================================================================
-->

<template>
  <!-- 顶部栏容器：固定顶部 64px，毛玻璃效果（参考老项目 .home-topbar） -->
  <header class="h-16 sticky top-0 z-10 flex items-center justify-between px-5
                bg-white/70 dark:bg-gray-800/70 backdrop-blur-md
                border-b border-gray-200 dark:border-gray-700
                transition-colors duration-500">

    <!-- ========== 左侧：搜索框（参考老项目 .home-search） ========== -->
    <div class="flex-1 max-w-[520px] min-w-0">
      <el-input
        placeholder="搜索教材...（即将上线）"
        disabled
        size="default"
        clearable
      >
        <template #prefix>
          <!-- 搜索图标 18x18 -->
          <svg class="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </template>
      </el-input>
    </div>

    <!-- ========== 右侧：操作按钮组（参考老项目 .home-topbar-right） ========== -->
    <div class="flex items-center gap-3 ml-4">
      <!-- 通知铃铛按钮（骨架占位，参考老项目 .home-icon-btn） -->
      <button
        disabled
        class="w-9 h-9 rounded-[10px]
               border border-gray-200 dark:border-gray-700
               bg-white/90 dark:bg-gray-800/90
               text-gray-400 dark:text-gray-600
               flex items-center justify-center
               cursor-not-allowed
               transition-all duration-500"
        title="通知（即将上线）"
      >
        <!-- 铃铛图标 -->
        <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
      </button>

      <!-- 主题切换按钮 -->
      <button
        @click="$emit('toggle-theme')"
        class="w-9 h-9 rounded-[10px]
               border border-gray-200 dark:border-gray-700
               bg-white/90 dark:bg-gray-800/90
               text-gray-600 dark:text-gray-300
               hover:border-blue-400/50 dark:hover:border-blue-500/40
               hover:shadow-md
               flex items-center justify-center
               transition-all duration-500"
        :title="isDark ? '切换到亮色模式' : '切换到暗黑模式'"
      >
        <!-- 暗黑模式 → 太阳图标 -->
        <svg v-if="isDark" class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
        </svg>
        <!-- 亮色模式 → 月亮图标 -->
        <svg v-else class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
        </svg>
      </button>

      <!-- ===== 用户区：下拉菜单（参考老项目 .home-user） ===== -->
      <div class="relative">
        <!-- 用户触发按钮 -->
        <button
          class="h-9 rounded-full
                 border border-gray-200 dark:border-gray-700
                 bg-white/90 dark:bg-gray-800/90
                 px-2.5 py-0
                 flex items-center gap-2.5
                 cursor-pointer
                 hover:shadow-md
                 transition-all duration-500"
          @click="showUserMenu = !showUserMenu"
          title="用户菜单"
        >
          <span class="text-[13px] font-semibold text-black dark:text-white
                       max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap
                       hidden sm:inline transition-colors duration-500">
            {{ userName }}
          </span>
          <!-- 头像圆圈（参考老项目 .home-avatar） -->
          <el-avatar :size="26" class="bg-blue-500 dark:bg-blue-400 text-white text-xs flex-shrink-0">
            {{ userInitial }}
          </el-avatar>
        </button>

        <!-- 下拉菜单 -->
        <div
          v-if="showUserMenu"
          class="absolute right-0 top-full mt-2.5
                 w-40 rounded-[10px]
                 bg-white/95 dark:bg-gray-800/95
                 border border-gray-200 dark:border-gray-700
                 shadow-[0_18px_45px_rgba(20,40,70,0.12)]
                 dark:shadow-[0_18px_45px_rgba(0,0,0,0.3)]
                 overflow-hidden z-10
                 transition-all duration-500"
        >
          <!-- 菜单项：退出 -->
          <button
            class="w-full text-left px-3.5 py-2.5
                   text-[13px] text-red-500 dark:text-red-400
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
// 参考老项目：通知铃铛 + 用户下拉菜单模式

import { ref, computed } from "vue";

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
const emit = defineEmits(["toggle-theme", "logout"]);

// ========== 响应式状态 ==========

/** 用户下拉菜单是否展开 */
const showUserMenu = ref(false);

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

// ========== 方法 ==========

/** 退出登录 */
function handleLogout() {
  showUserMenu.value = false;
  console.log(TAG + " 用户退出登录");
  emit("logout");
}
</script>
