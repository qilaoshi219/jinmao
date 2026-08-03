<!--
============================================================================
文件名：pages/mobile-quiz-detail/index.vue（手机端题库详情页）
文件作用：题库信息、正确率与进度、错题本入口、试卷列表（顺序/随机刷题）
        手机端不做文本导入（上传题库仅桌面端）
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <div class="min-h-screen transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部导航栏 -->
    <header class="flex items-center gap-4 px-4 py-4 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <el-button text class="!text-black dark:!text-white" @click="goBack">
        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        返回
      </el-button>
      <h1 class="text-black dark:text-white text-base font-bold transition-colors duration-500">
        题库详情
      </h1>
    </header>

    <!-- 主内容区 -->
    <main class="px-4 py-5 space-y-4">

      <!-- 加载中 -->
      <div v-if="loading" class="space-y-4">
        <div class="rounded-[10px] border p-5 animate-pulse transition-colors duration-500"
             :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
          <div class="h-5 bg-gray-200 dark:bg-neutral-800 rounded w-1/3 mb-3"/>
          <div class="h-4 bg-gray-100 dark:bg-neutral-800/50 rounded w-2/3"/>
        </div>
        <div class="h-40 rounded-[10px] border animate-pulse transition-colors duration-500"
             :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"/>
      </div>

      <template v-else>
        <!-- 题库基本信息卡片 -->
        <section class="rounded-[10px] border p-5 transition-colors duration-500"
                 :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
          <h2 class="text-black dark:text-white text-lg font-bold mb-2 transition-colors duration-500">
            {{ textbook.name }}
          </h2>
          <p v-if="textbook.description"
             class="text-gray-400 dark:text-gray-500 text-sm leading-relaxed transition-colors duration-500">
            {{ textbook.description }}
          </p>
          <div class="flex items-center gap-3 mt-3">
            <el-tag v-if="textbook.ownType === 'borrowed'" type="info" size="small">借用的</el-tag>
            <el-tag v-else-if="textbook.isShared" type="success" size="small">已共享</el-tag>
            <span class="text-xs text-gray-400 dark:text-gray-500">
              {{ textbook.totalQuestions || 0 }} 题 · {{ textbook.totalExams || 0 }} 套试卷
            </span>
          </div>
        </section>

        <!-- 统计区域 -->
        <section class="rounded-[10px] border p-5 transition-colors duration-500"
                 :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
          <h3 class="text-black dark:text-white text-sm font-bold mb-4 transition-colors duration-500">
            学习统计
          </h3>

          <!-- 正确率环形图 -->
          <div class="flex items-center gap-5">
            <div class="relative w-[104px] h-[104px] flex-shrink-0">
              <svg viewBox="0 0 120 120" class="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="42" fill="none" stroke-width="10"
                        stroke="currentColor"
                        class="text-gray-200 dark:text-gray-700 transition-colors duration-500"/>
                <circle cx="60" cy="60" r="42" fill="none" stroke-width="10"
                        stroke-linecap="round"
                        :stroke-dasharray="ringDashArray"
                        class="text-blue-500 dark:text-blue-400 transition-all duration-700"/>
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-xl font-black text-black dark:text-white transition-colors duration-500">
                  {{ stats.accuracy }}%
                </span>
                <span class="text-[10px] text-gray-400 dark:text-gray-500">正确率</span>
              </div>
            </div>

            <!-- 进度统计 -->
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 mb-2">
                <span class="text-2xl font-black text-black dark:text-white transition-colors duration-500">
                  {{ stats.doneCount }}
                </span>
                <span class="text-sm text-gray-400 dark:text-gray-500">
                  / {{ stats.totalQuestions }} 题
                </span>
              </div>
              <el-progress
                :percentage="donePercent"
                :stroke-width="8"
                :show-text="false"
                class="mb-3"
              />
              <p class="text-xs text-gray-400 dark:text-gray-500">
                已正确 <span class="text-green-500 dark:text-green-400 font-bold">{{ stats.correctCount }}</span> 题
                · 错题本 <span class="text-amber-500 dark:text-amber-400 font-bold">{{ stats.wrongCount }}</span> 题
              </p>
            </div>
          </div>

          <!-- 错题本入口 -->
          <el-button
            class="w-full mt-4"
            :loading="wrongbookLoading"
            :disabled="wrongbookLoading"
            @click="handleWrongbook">
            {{ wrongbookLoading ? '进入中...' : '错题本复习' }}
          </el-button>
        </section>

        <!-- 试卷列表 -->
        <section>
          <h3 class="text-black dark:text-white text-base font-bold mb-3 transition-colors duration-500">
            试卷列表
          </h3>

          <div v-if="exams.length === 0"
               class="rounded-[10px] border border-dashed p-8 text-center transition-colors duration-500"
               :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
            <p class="text-gray-400 dark:text-gray-500 text-sm">暂无试卷，请在电脑端导入题库</p>
          </div>

          <div v-else class="flex flex-col gap-3">
            <div
              v-for="exam in exams"
              :key="exam.id"
              class="rounded-[10px] border p-4 transition-colors duration-500"
              :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
              <!-- 试卷名称与题数 -->
              <div class="flex items-center gap-2 min-w-0 mb-3">
                <svg class="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <span class="text-black dark:text-white text-sm font-bold truncate transition-colors duration-500">
                  {{ exam.name }}
                </span>
                <span class="text-gray-400 dark:text-gray-500 text-xs flex-shrink-0">
                  · {{ exam.questionCount }} 题
                </span>
                <div class="ml-auto flex-shrink-0">
                  <el-dropdown
                    v-if="textbook.ownType === 'own'"
                    trigger="click"
                    @command="(cmd) => handleExamMenu(cmd, exam)">
                    <el-button size="small" circle title="更多操作">
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="5" cy="12" r="1.6"/>
                        <circle cx="12" cy="12" r="1.6"/>
                        <circle cx="19" cy="12" r="1.6"/>
                      </svg>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="publish">公开为二维码考试</el-dropdown-item>
                        <el-dropdown-item command="stats">考试数据</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="flex items-center gap-2">
                <el-button
                  type="primary"
                  size="small"
                  class="flex-1"
                  :loading="loadingExamId === exam.id + '_seq'"
                  :disabled="loadingExamId !== null"
                  @click="handleSequentialQuiz(exam.id)">
                  {{ loadingExamId === exam.id + '_seq' ? '进入中...' : '顺序刷题' }}
                </el-button>
                <el-button
                  type="success"
                  size="small"
                  class="flex-1"
                  :loading="loadingExamId === exam.id + '_rnd'"
                  :disabled="loadingExamId !== null"
                  @click="handleRandomQuiz(exam.id)">
                  {{ loadingExamId === exam.id + '_rnd' ? '进入中...' : '随机刷题' }}
                </el-button>
                <el-button
                  v-if="textbook.ownType === 'own'"
                  type="danger"
                  size="small"
                  :loading="deletingExamId === exam.id"
                  :disabled="deletingExamId !== null"
                  @click="handleDeleteExam(exam)">
                  {{ deletingExamId === exam.id ? '删除中...' : '删除' }}
                </el-button>
              </div>
            </div>
          </div>
        </section>
      </template>
    </main>

    <!-- 公开考试发布弹窗 -->
    <PublicExamDialog
      v-model="publicExamDialogVisible"
      :exam-id="publishExamId"
      @view-stats="handleViewStats"
    />
  </div>
</template>

<script src="./script.js"></script>
