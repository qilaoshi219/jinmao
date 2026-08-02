<!--
============================================================================
文件名：MobileQuickActionGrid.vue（手机端快捷入口宫格组件）
文件作用：手机端首页 4 个快捷入口按钮，避免 mobile-home 模板膨胀
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <!-- 4 宫格快捷入口容器 -->
  <div class="grid grid-cols-4 gap-2.5 w-full">
    <!--
    遍历 ACTION_ITEMS 渲染每个入口
    每个入口是一个可点击的方块，包含图标 + 标题 + 辅助文案
    -->
    <button
      v-for="item in ACTION_ITEMS"
      :key="item.key"
      class="flex flex-col items-center justify-center gap-1.5
             rounded-[10px] py-3.5 px-1
             bg-white dark:bg-neutral-950
             border border-gray-200 dark:border-neutral-700
             text-black dark:text-white
             active:scale-95 active:bg-blue-50 dark:active:bg-blue-900/20
             active:border-blue-400 dark:active:border-blue-500
             transition-all duration-500
             select-none"
      @click="$emit('action', item.key)"
    >
      <!-- 图标区域（蓝色圆角方块） -->
      <div class="w-9 h-9 rounded-[10px]
                  bg-blue-50 dark:bg-blue-900/20
                  border border-blue-200/40 dark:border-blue-800/30
                  flex items-center justify-center
                  transition-colors duration-500">
        <svg class="w-4.5 h-4.5 text-blue-500 dark:text-blue-400"
             fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24">
          <path :d="item.iconPath" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <!-- 标题 -->
      <span class="text-[12px] font-bold leading-tight
                   text-black dark:text-white
                   transition-colors duration-500">
        {{ item.label }}
      </span>

      <!-- 辅助文案（水印级灰字，仅用于辅助说明） -->
      <span class="text-[10px] leading-tight
                   text-gray-400 dark:text-gray-500">
        {{ item.desc }}
      </span>
    </button>
  </div>
</template>

<script setup>
// ==================== MobileQuickActionGrid 逻辑 ====================
// 职责：提供固定 4 个快捷入口的静态配置，通过 emit 向父组件派发点击事件

// 日志前缀
const TAG = "[MobileQuickActionGrid]";

// ==================== 快捷入口静态配置 ====================
// 按计划固定为 4 个入口，不做配置化参数
const ACTION_ITEMS = [
  {
    key: "my-courses",
    label: "我的教材",
    desc: "查看已生成教材",
    // SVG path: 书本图标
    iconPath: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  },
  {
    key: "quiz-training",
    label: "习题训练",
    desc: "开始刷题练习",
    // SVG path: 编辑/笔图标
    iconPath: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  },
  {
    key: "quiz-market",
    label: "题库市场",
    desc: "查看共享题库",
    // SVG path: 网格/市场图标
    iconPath: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
  },
  {
    key: "my-balance",
    label: "我的余额",
    desc: "查看账户余额",
    // SVG path: 钱包/信用卡图标
    iconPath: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  },
];

// ==================== 事件定义 ====================
// 向外派发 action 事件，传递入口 key
defineEmits(["action"]);

console.log(TAG + " 快捷入口组件已创建");
</script>
