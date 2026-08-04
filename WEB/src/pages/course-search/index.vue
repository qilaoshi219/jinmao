<!--
============================================================================
文件名：pages/course-search/index.vue（教材全文检索页面）
文件作用：在教材内容中搜索关键词，命中课程/章节/页码，点击跳转学习
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
      <h1 class="text-sm font-bold text-black dark:text-white ml-3 transition-colors duration-500">教材全文检索</h1>
    </header>

    <main class="flex-1 overflow-y-auto p-5">
      <div class="max-w-[680px] mx-auto">

        <!-- 搜索框 -->
        <div class="flex gap-2 mb-6">
          <el-input
            v-model="keyword"
            placeholder="搜索教材内容，如「导数」「闸门」..."
            clearable
            size="large"
            @keyup.enter="doSearch"
            @clear="reset" />
          <el-button type="primary" size="large" :loading="loading" @click="doSearch">
            {{ loading ? '搜索中...' : '搜索' }}
          </el-button>
        </div>

        <!-- 加载中 -->
        <div v-if="loading" class="flex flex-col items-center py-20 gap-3">
          <el-icon class="is-loading" :size="26"><Loading /></el-icon>
          <span class="text-sm text-black dark:text-white">正在搜索教材内容...</span>
        </div>

        <!-- 空结果 -->
        <div v-else-if="searched && results.length === 0"
             class="text-center py-20 border border-dashed rounded-[10px] transition-colors duration-500"
             :style="{ borderColor: 'var(--color-border)' }">
          <p class="text-4xl mb-3">🔍</p>
          <p class="text-sm font-medium text-black dark:text-white mb-1">没有找到「{{ lastKeyword }}」相关内容</p>
          <p class="text-xs text-gray-400 dark:text-gray-500">换个关键词试试</p>
        </div>

        <!-- 结果列表 -->
        <div v-else-if="results.length > 0" class="flex flex-col gap-3">
          <p class="text-xs text-gray-400 dark:text-gray-500">共找到 {{ results.length }} 处匹配</p>
          <div v-for="(r, i) in results" :key="i"
               class="rounded-[10px] border p-4 cursor-pointer transition-all duration-500 hover:border-blue-500 dark:hover:border-blue-400"
               :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }"
               @click="goTo(r)">
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <h3 class="text-sm font-bold text-black dark:text-white truncate">{{ r.courseName }}</h3>
                <el-tag size="small" effect="plain">{{ r.chapterName }}</el-tag>
                <el-tag v-if="r.page" size="small" type="warning" effect="light">第 {{ r.page }} 页</el-tag>
              </div>
              <svg class="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </div>
            <p v-for="(s, si) in r.snippets" :key="si"
               class="text-xs text-black dark:text-white leading-relaxed mb-1 last:mb-0">
              {{ s.snippet }}
            </p>
          </div>
        </div>

        <!-- 未搜索提示 -->
        <div v-else class="text-center py-20">
          <p class="text-4xl mb-3">📚</p>
          <p class="text-sm text-gray-400 dark:text-gray-500">输入关键词，在教材内容里找到对应的章节和页码</p>
        </div>
      </div>
    </main>
  </div>
</template>

<script src="./script.js"></script>
