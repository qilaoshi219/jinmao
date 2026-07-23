<!--
============================================================================
文件名：HomeSidebar.vue（首页侧边栏组件 — NERV 蓝色战术风格）
文件作用：首页左侧固定侧边栏，灵感来自 jinmao-nerv-redesign 设计稿
        NERV 风格要素：CSS 变量背景/边框、状态轨导航指示器、品牌字体层次
        遵守设计规范（纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配）
============================================================================
-->

<template>
  <!-- ===== NERV 战术侧边栏容器 ===== -->
  <!-- 背景/边框使用 CSS token，支持亮暗切换 -->
  <aside
    class="h-screen sticky top-0 flex flex-col border-r transition-all duration-500 z-20"
    :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }"
    :class="collapsed ? 'w-[84px]' : 'w-[252px]'">

    <!-- ===== 顶部品牌区 (NERV 风格) ===== -->
    <div class="px-4 pt-5 pb-2 transition-colors duration-500">
      <div :class="collapsed ? 'flex justify-center' : 'flex flex-col'">
        <!-- 展开态：主标题 + 副标题 -->
        <template v-if="!collapsed">
          <h1 class="text-lg font-black tracking-wider text-black dark:text-white
                     transition-colors duration-500 select-none">
            金毛教你学
          </h1>
          <p class="text-[10px] font-mono tracking-[0.2em] text-blue-500 dark:text-blue-400
                    mt-0.5 transition-colors duration-500 select-none">
            自学平台
          </p>
        </template>
        <!-- 收缩态：NERV 简化徽标 -->
        <div v-else
             class="w-8 h-8 rounded-[10px] bg-gradient-to-b from-blue-500 to-blue-600
                    dark:from-blue-400 dark:to-blue-500 flex items-center justify-center
                    shadow-md shadow-blue-500/20 dark:shadow-blue-400/20">
          <span class="text-white font-extrabold text-sm">金</span>
        </div>
      </div>
      <!-- NERV 蓝色状态轨下划线 (3px) -->
      <div class="h-[3px] bg-blue-500 dark:bg-blue-400 rounded-full mt-3
                  transition-colors duration-500" />
    </div>

    <!-- ===== 上传教材按钮 ===== -->
    <div class="px-3 mt-2">
      <el-button type="primary" class="w-full" @click="$emit('upload')">
        <template v-if="collapsed">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 4v16m8-8H4"/>
          </svg>
        </template>
        <template v-else>上传教材</template>
      </el-button>
    </div>

    <!-- ===== 主导航菜单 (NERV 状态轨) ===== -->
    <nav class="flex-1 overflow-y-auto py-2 px-3 transition-colors duration-500">
      <ul class="space-y-1">
        <!-- 全部教材（动态激活态 + nerv-rail 状态轨） -->
        <li>
          <button
            @click="$emit('select', 'courses')"
            :class="[
              'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px]',
              'transition-all duration-500',
              activeMenu === 'courses'
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-500 font-semibold nerv-rail'
                : 'text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800/50'
            ]">
            <svg class="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            <span v-show="!collapsed" class="whitespace-nowrap">全部教材</span>
          </button>
        </li>

        <!-- 我的阅读（骨架占位） -->
        <li>
          <button disabled
            class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px]
                   text-gray-400 dark:text-gray-600 cursor-not-allowed
                   transition-colors duration-500">
            <svg class="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            <span v-show="!collapsed" class="whitespace-nowrap">我的阅读</span>
          </button>
        </li>

        <!-- 习题训练（骨架占位） -->
        <li>
          <button disabled
            class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px]
                   text-gray-400 dark:text-gray-600 cursor-not-allowed
                   transition-colors duration-500">
            <svg class="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
            <span v-show="!collapsed" class="whitespace-nowrap">习题训练</span>
          </button>
        </li>
      </ul>

      <!-- 分隔线（使用 CSS token 边框色） -->
      <div class="h-px my-3 transition-colors duration-500"
           :style="{ backgroundColor: 'var(--color-border)' }" />

      <!-- 次级菜单 -->
      <ul class="space-y-1">
        <!-- 笔记（骨架占位） -->
        <li>
          <button disabled
            class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px]
                   text-gray-400 dark:text-gray-600 cursor-not-allowed
                   transition-colors duration-500">
            <svg class="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <span v-show="!collapsed" class="whitespace-nowrap">笔记</span>
          </button>
        </li>

        <!-- 收藏（骨架占位） -->
        <li>
          <button disabled
            class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px]
                   text-gray-400 dark:text-gray-600 cursor-not-allowed
                   transition-colors duration-500">
            <svg class="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
            <span v-show="!collapsed" class="whitespace-nowrap">收藏</span>
          </button>
        </li>
      </ul>
    </nav>

    <!-- ===== 底部区域：积分进度 + 用户信息 ===== -->
    <div class="border-t px-3 py-3 transition-colors duration-500"
         :style="{ borderColor: 'var(--color-border)' }">

      <!-- 积分进度（仅展开态显示） -->
      <div v-show="!collapsed" class="mb-3 px-1 transition-colors duration-500">
        <div class="flex items-center justify-between text-xs mb-1">
          <span class="text-black dark:text-white font-mono transition-colors duration-500">
            320/500 积分
          </span>
          <a href="#"
             class="text-blue-500 dark:text-blue-400 hover:underline
                    transition-colors duration-500 font-medium">
            升级会员 &rarr;
          </a>
        </div>
        <!-- 积分进度条 -->
        <div class="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden
                    transition-colors duration-500">
          <div class="h-full rounded-full bg-blue-500 dark:bg-blue-400
                      transition-all duration-500"
               style="width: 64%" />
        </div>
      </div>

      <!-- 用户信息（收缩时仅显示头像） -->
      <div class="flex items-center gap-2 px-1 transition-colors duration-500">
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