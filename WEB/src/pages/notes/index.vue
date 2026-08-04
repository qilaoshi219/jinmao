<!--
============================================================================
文件名：pages/notes/index.vue（我的笔记页面）
文件作用：跨课程汇总展示所有笔记，支持去学习跳转、编辑删除、导出 Markdown
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配、蓝色主色
============================================================================
-->

<template>
  <div class="min-h-screen flex flex-col transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部栏 -->
    <header class="flex items-center px-5 py-3 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <el-button size="small" text class="text-black dark:text-white" @click="goBack">返回首页</el-button>
      <h1 class="text-sm font-bold text-black dark:text-white ml-3 transition-colors duration-500">我的笔记</h1>
      <div class="flex-1"></div>
      <el-button size="small" :disabled="groups.length === 0" @click="exportNotes">导出 Markdown</el-button>
    </header>

    <main class="flex-1 overflow-y-auto p-5">
      <div class="max-w-[680px] mx-auto">

        <!-- 加载中 -->
        <div v-if="loading" class="flex flex-col items-center py-24 gap-3">
          <el-icon class="is-loading" :size="28"><Loading /></el-icon>
          <span class="text-sm text-black dark:text-white">加载笔记中...</span>
        </div>

        <!-- 空状态 -->
        <div v-else-if="groups.length === 0"
             class="text-center py-24 border border-dashed rounded-[10px] transition-colors duration-500"
             :style="{ borderColor: 'var(--color-border)' }">
          <p class="text-4xl mb-3">📝</p>
          <p class="text-sm font-medium text-black dark:text-white mb-1">还没有笔记</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-5">学习页「工具 → 本页笔记」即可记录</p>
          <el-button type="primary" @click="goBack">去学习</el-button>
        </div>

        <!-- 按课程分组 -->
        <div v-else v-for="g in groups" :key="g.courseId"
             class="rounded-[10px] border overflow-hidden mb-4 transition-colors duration-500"
             :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
          <div class="flex items-center justify-between px-4 py-3 border-b transition-colors duration-500"
               :style="{ borderColor: 'var(--color-border)' }">
            <h3 class="text-sm font-bold text-black dark:text-white truncate">{{ g.courseName }}</h3>
            <el-tag size="small" effect="plain">{{ g.notes.length }} 条</el-tag>
          </div>

          <div class="px-4 py-2">
            <div v-for="n in g.notes" :key="n.id"
                 class="rounded-[10px] border p-3 mb-2 transition-colors duration-500"
                 :style="{ backgroundColor: noteBg(n.color), borderColor: noteBorder(n.color) }">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <span class="text-[11px] font-medium" :class="noteText(n.color)">
                  {{ n.chapterName }} · 第 {{ n.pageNumber }} 页 · {{ timeText(n.updateTime) }}
                </span>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <el-button size="small" text type="primary" @click="goStudy(g.courseId, n.chapterId)">去学习</el-button>
                  <el-button size="small" text type="danger" :loading="deletingId === n.id" @click="remove(n)">
                    删除
                  </el-button>
                </div>
              </div>
              <p class="text-sm text-black dark:text-white whitespace-pre-wrap leading-relaxed">{{ n.content }}</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script src="./script.js"></script>
