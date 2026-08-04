<!--
============================================================================
文件名：index.vue（思维导图查看页）
所属目录：src/pages/mindmap/
文件作用：展示指定课程-章节已生成的思维导图（markmap HTML，iframe 内嵌渲染）
         App.vue navigate("mindmap", { courseId, chapterId }) → provide mindmapParams
设计规范遵循：规则1-9，Element Plus 优先，暗黑双轨适配
============================================================================
-->

<template>
  <div class="flex flex-col h-screen overflow-hidden bg-[var(--color-bg-primary)] transition-colors duration-500">

    <!-- ===== 顶栏 h-10（与学习页保持一致） ===== -->
    <header class="flex items-center justify-between h-10 px-3 border-b flex-shrink-0 bg-[var(--color-bg-secondary)] border-[var(--color-border)] transition-colors duration-500">
      <!-- 左侧：返回按钮 -->
      <button @click="goBack"
              class="flex items-center gap-1 text-xs font-medium text-blue-500 dark:text-blue-400 hover:opacity-80 transition-opacity duration-500 bg-transparent border-none cursor-pointer">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        <span>返回</span>
      </button>
      <!-- 中间：课程/章节标题 -->
      <span class="text-xs text-[var(--color-text-secondary)] truncate max-w-[50%]">{{ title }}</span>
      <!-- 右侧：主题切换 -->
      <button @click="toggleTheme"
              class="flex items-center justify-center w-6 h-6 rounded-[10px] border border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:text-blue-500 hover:border-blue-500 dark:hover:text-blue-400 dark:hover:border-blue-400 transition-all duration-500 cursor-pointer"
              title="切换主题">
        <svg v-show="isDark" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" stroke-width="2"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <svg v-show="!isDark" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </header>

    <!-- ===== 主体：思维导图 iframe ===== -->
    <main class="flex-1 relative min-h-0 bg-[var(--color-card)] transition-colors duration-500">
      <!-- 加载中指示器 -->
      <div v-if="loading" class="absolute inset-0 flex flex-col items-center justify-center z-10">
        <svg class="w-8 h-8 text-blue-500 dark:text-blue-400 mb-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        <span class="text-xs text-[var(--color-text-secondary)]">思维导图加载中...</span>
      </div>

      <!-- 未生成空态 -->
      <div v-if="!loading && !mindmapUrl" class="absolute inset-0 flex flex-col items-center justify-center z-10">
        <svg class="w-12 h-12 text-[var(--color-text-secondary)] mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/>
        </svg>
        <span class="text-sm text-[var(--color-text-secondary)] font-mono tracking-wider">该章节思维导图尚未生成</span>
        <el-button size="small" type="primary" class="mt-4 rounded-[10px]" @click="goBack">返回学习页生成</el-button>
      </div>

      <!-- 思维导图 iframe：全屏展示 markmap HTML -->
      <iframe v-show="!loading && mindmapUrl"
              :key="isDark ? 'dark' : 'light'"
              :src="mindmapSrc"
              class="absolute inset-0 w-full h-full border-none z-10"
              sandbox="allow-scripts allow-same-origin"
              @load="onMindmapLoad"
      ></iframe>
    </main>
  </div>
</template>

<script src="./script.js"></script>
