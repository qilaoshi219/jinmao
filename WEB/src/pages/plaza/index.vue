<!--
============================================================================
文件名：pages/plaza/index.vue（公开课广场页面）
文件作用：浏览并借阅公开课；管理自己发布的公开课与借阅
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
      <h1 class="text-sm font-bold text-black dark:text-white ml-3 transition-colors duration-500">公开课广场</h1>
    </header>

    <main class="flex-1 overflow-y-auto p-5">
      <div class="max-w-[680px] mx-auto">

        <!-- Tab 切换 -->
        <div class="flex gap-2 mb-5">
          <button
            v-for="t in tabs"
            :key="t.value"
            class="px-4 py-2 text-[13px] rounded-[10px] border transition-all duration-500"
            :class="activeTab === t.value
              ? 'bg-blue-500 dark:bg-blue-400 text-white font-semibold border-blue-500 dark:border-blue-400'
              : 'text-black dark:text-white border-[var(--color-border)] hover:bg-blue-50 dark:hover:bg-blue-900/20'"
            @click="switchTab(t.value)">
            {{ t.label }}
          </button>
        </div>

        <!-- ===== 广场 ===== -->
        <template v-if="activeTab === 'market'">
          <div class="flex gap-2 mb-4">
            <el-input
              v-model="keyword"
              placeholder="搜索公开课..."
              clearable
              @keyup.enter="search"
              @clear="search" />
            <el-button type="primary" :loading="marketLoading" @click="search">搜索</el-button>
          </div>

          <div v-if="marketLoading" class="flex flex-col items-center py-20 gap-3">
            <el-icon class="is-loading" :size="26"><Loading /></el-icon>
            <span class="text-sm text-black dark:text-white">加载中...</span>
          </div>

          <div v-else-if="marketList.length === 0"
               class="text-center py-20 border border-dashed rounded-[10px] transition-colors duration-500"
               :style="{ borderColor: 'var(--color-border)' }">
            <p class="text-sm text-black dark:text-white mb-1">暂无公开课</p>
            <p class="text-xs text-gray-400 dark:text-gray-500">去「我的」发布你的课程吧</p>
          </div>

          <div v-else class="flex flex-col gap-3">
            <div v-for="item in marketList" :key="item.id"
                 class="rounded-[10px] border p-4 transition-all duration-500 hover:shadow-md"
                 :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h3 class="text-sm font-bold text-black dark:text-white truncate">{{ item.name }}</h3>
                  <p v-if="item.subtitle" class="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">{{ item.subtitle }}</p>
                  <div class="flex items-center gap-2 mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                    <span>发布者：{{ item.ownerName }}</span>
                    <span>· {{ item.chapterCount }} 章</span>
                    <span>· {{ item.borrowCount }} 人借阅</span>
                  </div>
                </div>
                <el-button
                  v-if="!item.borrowedByMe"
                  size="small" type="primary" class="rounded-[10px] flex-shrink-0"
                  :loading="actingId === item.id" @click="borrow(item)">
                  借阅
                </el-button>
                <div v-else class="flex flex-col gap-1.5 flex-shrink-0">
                  <el-button size="small" type="primary" class="rounded-[10px]" @click="goStudy(item.id)">
                    去学习
                  </el-button>
                  <el-button size="small" class="rounded-[10px]" :loading="actingId === item.id" @click="unborrow(item)">
                    取消借阅
                  </el-button>
                </div>
              </div>
            </div>

            <el-pagination
              v-if="marketTotal > pageSize"
              class="mt-4 justify-center"
              background
              layout="prev, pager, next"
              :total="marketTotal"
              :page-size="pageSize"
              :current-page="currentPage"
              @current-change="onPageChange"
            />
          </div>
        </template>

        <!-- ===== 我的 ===== -->
        <template v-else>
          <div v-if="mineLoading" class="flex flex-col items-center py-20 gap-3">
            <el-icon class="is-loading" :size="26"><Loading /></el-icon>
            <span class="text-sm text-black dark:text-white">加载中...</span>
          </div>

          <template v-else>
            <h2 class="text-sm font-bold text-black dark:text-white mb-3">我发布的公开课</h2>
            <div v-if="mine.published.length === 0"
                 class="text-center py-8 border border-dashed rounded-[10px] mb-6 transition-colors duration-500"
                 :style="{ borderColor: 'var(--color-border)' }">
              <p class="text-xs text-gray-400 dark:text-gray-500">还没有发布公开课</p>
            </div>
            <div v-else class="flex flex-col gap-2 mb-6">
              <div v-for="item in mine.published" :key="item.id"
                   class="rounded-[10px] border p-4 transition-colors duration-500"
                   :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="text-sm font-bold text-black dark:text-white truncate">{{ item.name }}</h3>
                    <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{{ item.borrowCount }} 人借阅 · {{ item.chapterCount }} 章</p>
                  </div>
                  <div class="flex gap-1.5 flex-shrink-0">
                    <el-button size="small" type="primary" plain class="rounded-[10px]" @click="goStudy(item.id)">去学习</el-button>
                    <el-button size="small" class="rounded-[10px]" :loading="actingId === item.id" @click="unpublish(item)">
                      取消发布
                    </el-button>
                  </div>
                </div>
              </div>
            </div>

            <h2 class="text-sm font-bold text-black dark:text-white mb-3">我借阅的公开课</h2>
            <div v-if="mine.borrowed.length === 0"
                 class="text-center py-8 border border-dashed rounded-[10px] transition-colors duration-500"
                 :style="{ borderColor: 'var(--color-border)' }">
              <p class="text-xs text-gray-400 dark:text-gray-500">还没有借阅公开课</p>
            </div>
            <div v-else class="flex flex-col gap-2">
              <div v-for="item in mine.borrowed" :key="item.id"
                   class="rounded-[10px] border p-4 transition-colors duration-500"
                   :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="text-sm font-bold text-black dark:text-white truncate">{{ item.name }}</h3>
                    <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-1">发布者：{{ item.ownerName }} · {{ item.chapterCount }} 章</p>
                  </div>
                  <div class="flex gap-1.5 flex-shrink-0">
                    <el-button size="small" type="primary" class="rounded-[10px]" @click="goStudy(item.id)">去学习</el-button>
                    <el-button size="small" class="rounded-[10px]" :loading="actingId === item.id" @click="unborrow(item)">
                      取消借阅
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </template>
      </div>
    </main>
  </div>
</template>

<script src="./script.js"></script>
