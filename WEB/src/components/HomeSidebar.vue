<!--
============================================================================
文件名：HomeSidebar.vue（首页侧边栏组件）
文件作用：首页左侧固定侧边栏，包含品牌 LOGO、导航菜单、用户信息
        参考金毛教你学布局，遵守设计规范（纯黑纯白文字、10px圆角、500ms过渡）
============================================================================
-->

<template>
  <!-- 侧边栏容器：固定宽度 252px，全高，毛玻璃效果 -->
  <aside class="w-[252px] h-screen sticky top-0 flex flex-col border-r border-gray-200 dark:border-gray-700
              bg-white/85 dark:bg-gray-800/85 backdrop-blur-md
              transition-all duration-500 z-20" :class="{ 'w-[84px]': collapsed }">

    <!-- ========== 品牌 LOGO 区域 ========== -->
    <div class="flex items-center gap-3 px-4 py-5 border-b border-gray-100 dark:border-gray-700/50
                transition-colors duration-500">
      <!-- 蓝色圆形 LOGO -->
      <div class="w-9 h-9 rounded-full bg-blue-500 dark:bg-blue-400 flex items-center justify-center
                  flex-shrink-0 shadow-md shadow-blue-500/30 dark:shadow-blue-400/30">
        <!-- 书本图标 SVG -->
        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
      </div>
      <!-- 品牌名称（收缩时隐藏文字） -->
      <span v-show="!collapsed" class="text-black dark:text-white font-bold text-base whitespace-nowrap
                                     transition-colors duration-500">
        金毛教你学
      </span>
    </div>

    <!-- ========== 主导航菜单 ========== -->
    <nav class="flex-1 overflow-y-auto py-3 px-3 transition-colors duration-500">
      <ul class="space-y-1">
        <!-- 全部教材（激活态） -->
        <li>
          <button
            @click="$emit('select', 'courses')"
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium
                   transition-all duration-500
                   bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          >
            <!-- 书本图标 -->
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            <span v-show="!collapsed" class="whitespace-nowrap">全部教材</span>
          </button>
        </li>

        <!-- 阅读（骨架占位，灰色禁用） -->
        <li>
          <button disabled
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm
                   text-gray-400 dark:text-gray-600 cursor-not-allowed
                   transition-colors duration-500">
            <!-- 眼睛图标 -->
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            <span v-show="!collapsed" class="whitespace-nowrap">阅读</span>
          </button>
        </li>

        <!-- 习题训练（骨架占位） -->
        <li>
          <button disabled
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm
                   text-gray-400 dark:text-gray-600 cursor-not-allowed
                   transition-colors duration-500">
            <!-- 铅笔图标 -->
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
            <span v-show="!collapsed" class="whitespace-nowrap">习题训练</span>
          </button>
        </li>

        <!-- 笔记（骨架占位） -->
        <li>
          <button disabled
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm
                   text-gray-400 dark:text-gray-600 cursor-not-allowed
                   transition-colors duration-500">
            <!-- 文档图标 -->
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <span v-show="!collapsed" class="whitespace-nowrap">笔记</span>
          </button>
        </li>

        <!-- 收藏（骨架占位） -->
        <li>
          <button disabled
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm
                   text-gray-400 dark:text-gray-600 cursor-not-allowed
                   transition-colors duration-500">
            <!-- 星星图标 -->
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
            <span v-show="!collapsed" class="whitespace-nowrap">收藏</span>
          </button>
        </li>
      </ul>
    </nav>

    <!-- ========== 底部：上传按钮 + 用户信息 ========== -->
    <div class="border-t border-gray-100 dark:border-gray-700/50 p-3
                transition-colors duration-500">
      <!-- 上传教材按钮 -->
      <el-button
        type="primary"
        class="w-full"
        @click="$emit('upload')"
      >
        <template v-if="collapsed">
          <!-- 收缩态：仅图标 -->
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
        </template>
        <template v-else>
          上传教材
        </template>
      </el-button>

      <!-- 用户信息（收缩时只显示头像） -->
      <div class="flex items-center gap-2 mt-3 px-1 transition-colors duration-500">
        <el-avatar :size="32" class="bg-blue-500 dark:bg-blue-400 text-white text-sm flex-shrink-0">
          {{ userInitial }}
        </el-avatar>
        <div v-show="!collapsed" class="min-w-0 flex-1">
          <p class="text-black dark:text-white text-sm font-medium truncate
                    transition-colors duration-500">
            {{ userName }}
          </p>
          <p class="text-gray-500 dark:text-gray-400 text-xs truncate
                    transition-colors duration-500">
            {{ userEmail }}
          </p>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
// ==================== HomeSidebar 逻辑 ====================
// 职责：接收父组件传入的用户信息和菜单状态，向上冒泡事件
// 响应式：窗口宽度 < 860px 时自动收缩侧边栏

import { computed, onMounted, onUnmounted, ref } from "vue";

// 日志前缀
const TAG = "[HomeSidebar]";

// ========== Props ==========
const props = defineProps({
  user: {
    type: Object, // 用户信息对象 { id, nickname, email, ... }
    default: () => ({}),
  },
  activeMenu: {
    type: String, // 当前激活菜单
    default: "courses",
  },
});

// ========== Emits ==========
defineEmits(["select", "upload"]);

// ========== 响应式收缩状态 ==========
const collapsed = ref(false);

/**
 * 窗口 resize 时判断是否收缩侧边栏
 * <860px 时收缩为 84px 宽（只显示图标）
 */
function handleResize() {
  collapsed.value = window.innerWidth < 860;
}

onMounted(() => {
  handleResize(); // 初始化检查
  window.addEventListener("resize", handleResize);
  console.log(TAG + " 侧边栏已挂载，窗口宽度: " + window.innerWidth + "px");
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});

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

/** 用户邮箱 */
const userEmail = computed(() => {
  return props.user?.email || "";
});
</script>
