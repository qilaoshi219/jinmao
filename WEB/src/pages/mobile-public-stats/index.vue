<!--
============================================================================
文件名：pages/mobile-public-stats/index.vue（手机端公开考试数据页）
文件作用：考试所有者查看参与人数、正确率、每题正确率与考生明细
============================================================================
-->

<template>
  <div class="min-h-screen transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部导航栏 -->
    <header class="flex items-center gap-4 px-4 py-4 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <el-button text class="!text-black dark:!text-white" @click="navigateBack">
        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        返回
      </el-button>
      <h1 class="text-black dark:text-white text-base font-bold">考试数据</h1>
    </header>

    <main class="px-4 py-5">
      <!-- 加载中 -->
      <div v-if="loading" class="space-y-4">
        <div class="rounded-[10px] border p-6 animate-pulse transition-colors duration-500"
             :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
          <div class="h-6 bg-gray-200 dark:bg-neutral-800 rounded w-1/3 mb-3"/>
          <div class="h-4 bg-gray-100 dark:bg-neutral-800/50 rounded w-2/3"/>
        </div>
      </div>

      <!-- 数据内容 -->
      <template v-else-if="stats">
        <!-- 考试标题与操作 -->
        <section class="rounded-[10px] border p-5 mb-4 transition-colors duration-500"
                 :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
          <div class="flex items-center justify-between gap-3 mb-2">
            <div class="min-w-0">
              <h2 class="text-black dark:text-white text-lg font-bold mb-1 truncate transition-colors duration-500">
                {{ stats.title }}
              </h2>
              <div class="flex items-center gap-2">
                <el-tag :type="stats.status === 'published' ? 'success' : 'info'" size="small">
                  {{ stats.status === 'published' ? '考试进行中' : '已停止' }}
                </el-tag>
                <span class="text-xs text-gray-400">
                  {{ stats.durationMinutes }} 分钟 · {{ stats.shuffle ? '乱序' : '固定顺序' }}
                </span>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2 mt-4">
            <el-button size="small" @click="openQr">二维码</el-button>
            <el-button size="small" @click="copyLink">复制链接</el-button>
            <el-button size="small" :type="stats.status === 'published' ? 'danger' : 'success'"
                       :loading="toggling" @click="toggleStatus">
              {{ stats.status === 'published' ? '停止考试' : '恢复考试' }}
            </el-button>
          </div>
        </section>

        <!-- 汇总统计卡片 -->
        <section class="grid grid-cols-2 gap-3 mb-4">
          <div class="rounded-[10px] border p-4 text-center transition-colors duration-500"
               :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
            <div class="text-2xl font-black text-black dark:text-white">{{ stats.totalParticipants }}</div>
            <div class="text-xs text-gray-400 mt-1">参与人数</div>
          </div>
          <div class="rounded-[10px] border p-4 text-center transition-colors duration-500"
               :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
            <div class="text-2xl font-black text-black dark:text-white">{{ stats.completedCount }}</div>
            <div class="text-xs text-gray-400 mt-1">已完成</div>
          </div>
          <div class="rounded-[10px] border p-4 text-center transition-colors duration-500"
               :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
            <div class="text-2xl font-black text-blue-500 dark:text-blue-400">{{ stats.averageAccuracy }}%</div>
            <div class="text-xs text-gray-400 mt-1">平均正确率</div>
          </div>
          <div class="rounded-[10px] border p-4 text-center transition-colors duration-500"
               :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
            <div class="text-2xl font-black text-green-500 dark:text-green-400">{{ stats.averageScore }}</div>
            <div class="text-xs text-gray-400 mt-1">平均得分</div>
          </div>
        </section>

        <!-- 每题正确率 -->
        <section class="rounded-[10px] border p-5 mb-4 transition-colors duration-500"
                 :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
          <h3 class="text-black dark:text-white text-base font-bold mb-3">每题正确率</h3>
          <div v-if="stats.perQuestion.length === 0" class="text-sm text-gray-400">暂无已完成的作答</div>
          <div v-else class="space-y-3">
            <div v-for="q in stats.perQuestion" :key="q.questionId" class="flex items-center gap-3">
              <span class="text-xs text-gray-400 w-6 flex-shrink-0">{{ q.index }}.</span>
              <div class="flex-1 min-w-0">
                <div class="text-xs text-black dark:text-white truncate mb-1">{{ q.content }}</div>
                <el-progress
                  :percentage="q.accuracy"
                  :stroke-width="8"
                  :color="q.accuracy >= 60 ? '#10b981' : q.accuracy >= 40 ? '#3b82f6' : '#ef4444'"
                  :show-text="false"
                />
              </div>
              <span class="text-xs text-gray-400 flex-shrink-0 w-14 text-right">
                {{ q.correctCount }}/{{ q.totalCount }}
              </span>
              <span class="text-sm font-bold text-black dark:text-white flex-shrink-0 w-11 text-right">
                {{ q.accuracy }}%
              </span>
            </div>
          </div>
        </section>

        <!-- 考生明细 -->
        <section class="rounded-[10px] border p-5 transition-colors duration-500"
                 :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
          <h3 class="text-black dark:text-white text-base font-bold mb-3">考生明细</h3>

          <div v-if="stats.participants.length === 0" class="text-sm text-gray-400">暂无已完成作答的考生</div>

          <div v-else class="space-y-2">
            <div
              v-for="p in stats.participants"
              :key="p.sessionId"
              class="rounded-[10px] border p-3 transition-colors duration-500"
              :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-medium text-black dark:text-white">
                  {{ p.name }}
                  <el-tag v-if="p.isAnonymous" size="small" type="info" class="ml-1">游客</el-tag>
                </span>
                <span class="text-sm font-bold text-black dark:text-white">{{ p.score }} 分</span>
              </div>
              <div class="flex items-center justify-between text-xs text-gray-400">
                <span>正确 {{ p.correctCount }}/{{ p.totalCount }} · 用时 {{ formatDuration(p.durationSeconds) }}</span>
                <span>{{ new Date(p.submittedAt).toLocaleString('zh-CN') }}</span>
              </div>
            </div>
          </div>

          <!-- 分页 -->
          <div v-if="stats.total > pageSize" class="flex justify-center mt-4">
            <el-pagination
              layout="prev, pager, next"
              :total="stats.total"
              :page-size="pageSize"
              :current-page="page"
              @current-change="onPageChange"
            />
          </div>
        </section>
      </template>
    </main>

    <!-- 二维码弹窗 -->
    <el-dialog v-model="qrDialogVisible" title="考试二维码" width="min(92vw, 400px)">
      <div class="flex flex-col items-center py-2">
        <div class="rounded-[10px] border p-3 mb-3"
             :style="{ borderColor: 'var(--color-border)', backgroundColor: '#fff' }">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="考试二维码" class="w-48 h-48 block" />
          <div v-else class="w-48 h-48 flex items-center justify-center text-gray-400 text-sm">生成中...</div>
        </div>
        <p class="text-sm font-bold text-black dark:text-white mb-1">扫码即可开始考试</p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">请将二维码或链接发送给考生</p>

        <div class="w-full flex items-center gap-2 rounded-[10px] border px-3 py-2"
             :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
          <span class="text-xs text-gray-400 flex-1 truncate">{{ examLink }}</span>
          <el-button size="small" @click="copyLink">复制</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script src="./script.js"></script>
