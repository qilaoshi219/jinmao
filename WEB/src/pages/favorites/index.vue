<!--
============================================================================
文件名：pages/favorites/index.vue（我的收藏页面）
文件作用：展示收藏的课程列表，支持进入学习与取消收藏
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
      <h1 class="text-sm font-bold text-black dark:text-white ml-3 transition-colors duration-500">我的收藏</h1>
    </header>

    <main class="flex-1 overflow-y-auto p-5">
      <div class="max-w-[680px] mx-auto">

        <!-- 加载中 -->
        <div v-if="loading" class="flex flex-col items-center py-24 gap-3">
          <el-icon class="is-loading" :size="28"><Loading /></el-icon>
          <span class="text-sm text-black dark:text-white">加载收藏中...</span>
        </div>

        <!-- 空状态 -->
        <div v-else-if="list.length === 0"
             class="text-center py-24 border border-dashed rounded-[10px] transition-colors duration-500"
             :style="{ borderColor: 'var(--color-border)' }">
          <p class="text-4xl mb-3">♥</p>
          <p class="text-sm font-medium text-black dark:text-white mb-1">还没有收藏的课程</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-5">在学习页点击顶栏的 ♥ 即可收藏课程</p>
          <el-button type="primary" @click="goHome">去逛逛</el-button>
        </div>

        <!-- 收藏列表 -->
        <div v-else class="flex flex-col gap-3">
          <div v-for="item in list" :key="item.id"
               class="rounded-[10px] border p-4 transition-all duration-500 hover:shadow-md"
               :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h3 class="text-sm font-bold text-black dark:text-white truncate">{{ item.name }}</h3>
                <p v-if="item.subtitle" class="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">{{ item.subtitle }}</p>
                <div class="flex items-center gap-2 mt-2">
                  <el-tag size="small" effect="plain">{{ item.chapterCount || 0 }} 章</el-tag>
                  <el-tag size="small" :type="statusType(item.pipelineStatus)" effect="light">
                    {{ statusLabel(item.pipelineStatus) }}
                  </el-tag>
                </div>
              </div>
              <div class="flex flex-col gap-2 flex-shrink-0">
                <el-button size="small" type="primary" class="rounded-[10px]" @click="openCourse(item.id)">
                  进入学习
                </el-button>
                <el-button size="small" :loading="removingId === item.id" class="rounded-[10px]" @click="remove(item)">
                  取消收藏
                </el-button>
              </div>
            </div>
          </div>

          <!-- 分页 -->
          <el-pagination
            v-if="total > pageSize"
            class="mt-4 justify-center"
            background
            layout="prev, pager, next"
            :total="total"
            :page-size="pageSize"
            :current-page="currentPage"
            @current-change="onPageChange"
          />
        </div>
      </div>
    </main>
  </div>
</template>

<script src="./script.js"></script>
