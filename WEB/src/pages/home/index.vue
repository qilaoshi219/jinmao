<!--
============================================================================
文件名：index.vue（首页入口组件）
所属目录：src/pages/home/（home 页面的专属文件夹）
文件作用：首页的 Vue SFC 入口组件
         Template 定义页面 HTML 结构（纯视图层，无业务逻辑）
         Script 通过 <script src="./script.js"> 引用同目录下的独立逻辑文件

页面布局：参考老项目"侧边栏 + 顶部栏 + 内容区"三块式布局
        新增：排序下拉、添加教材卡片、4个统计卡片
设计规范：纯黑纯白文字、10px圆角、500ms过渡、Element Plus优先、暗黑双轨适配
============================================================================
-->

<template>
  <!--
  ============================================================
  全屏 flex 行布局 — NERV 蓝色战术风格
    - 左侧：HomeSidebar（固定宽度侧边栏）
    - 右侧：flex-1 填充剩余空间的主区域
    - 不使用 max-w 限制宽度（遵守设计规范规则5）
  ============================================================
  -->
  <div class="flex h-screen bg-[var(--color-bg-primary)] transition-colors duration-500">

    <!-- ========== 左侧侧边栏 ========== -->
    <HomeSidebar
      :user="user"
      :active-menu="activeMenu"
      @select="setActiveMenu"
      @upload="openUploadDialog"
      @navigate-billing="navigateToBilling"
    />

    <!-- ========== 右侧主区域 ========== -->
    <div class="flex-1 flex flex-col min-w-0">

      <!-- ========== 顶部栏 ========== -->
      <HomeTopbar
        :user="user"
        :is-dark="isDark"
        @toggle-theme="toggleTheme"
        @logout="handleLogout"
      />

      <!-- ========== 主内容区 ========== -->
      <main class="flex-1 overflow-auto p-5 lg:px-8">

        <!-- ============================================================
        统计卡片区 — NERV 蓝色战术风格：左侧蓝色状态轨 + CSS 变量驱动
        ============================================================ -->
        <section class="mb-6">
          <div class="grid grid-cols-2 xl:grid-cols-4 gap-3.5">

            <!-- 累计学习时长 -->
            <div class="rounded-[10px] border border-[var(--color-border)]
                        bg-[var(--color-card)]
                        border-l-[3px] border-l-blue-500 dark:border-l-blue-400
                        p-4 transition-colors duration-500">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[13px] font-bold text-black dark:text-white
                             transition-colors duration-500">
                  累计学习时长
                </span>
                <div class="w-7 h-7 rounded-[10px]
                            bg-blue-50 dark:bg-blue-900/20
                            border border-blue-200/40 dark:border-blue-800/30
                            flex items-center justify-center
                            transition-colors duration-500">
                  <svg class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
              </div>
              <p class="mt-2.5 text-[22px] font-black text-black dark:text-white
                        transition-colors duration-500">
                {{ formatDuration(stats.totalStudyDuration) }}
              </p>
              <p class="mt-2 text-xs font-semibold text-green-500 dark:text-green-400
                        transition-colors duration-500">
                {{ stats.totalStudyDuration > 0 ? '已记录' : '暂无数据' }}
              </p>
            </div>

            <!-- 已完成章节 -->
            <div class="rounded-[10px] border border-[var(--color-border)]
                        bg-[var(--color-card)]
                        border-l-[3px] border-l-blue-500 dark:border-l-blue-400
                        p-4 transition-colors duration-500">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[13px] font-bold text-black dark:text-white
                             transition-colors duration-500">
                  已完成章节
                </span>
                <div class="w-7 h-7 rounded-[10px]
                            bg-blue-50 dark:bg-blue-900/20
                            border border-blue-200/40 dark:border-blue-800/30
                            flex items-center justify-center
                            transition-colors duration-500">
                  <svg class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
              </div>
              <p class="mt-2.5 text-[22px] font-black text-black dark:text-white
                        transition-colors duration-500">
                {{ stats.completedChapters }} <span class="text-sm font-normal text-gray-400">个</span>
              </p>
              <p class="mt-2 text-xs font-semibold text-green-500 dark:text-green-400
                        transition-colors duration-500">
                {{ stats.completedChapters > 0 ? '已完成' : '暂无数据' }}
              </p>
            </div>

            <!-- 习题正确率 -->
            <div class="rounded-[10px] border border-[var(--color-border)]
                        bg-[var(--color-card)]
                        border-l-[3px] border-l-blue-500 dark:border-l-blue-400
                        p-4 transition-colors duration-500">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[13px] font-bold text-black dark:text-white
                             transition-colors duration-500">
                  习题正确率
                </span>
                <div class="w-7 h-7 rounded-[10px]
                            bg-blue-50 dark:bg-blue-900/20
                            border border-blue-200/40 dark:border-blue-800/30
                            flex items-center justify-center
                            transition-colors duration-500">
                  <svg class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                  </svg>
                </div>
              </div>
              <p class="mt-2.5 text-[22px] font-black text-black dark:text-white
                        transition-colors duration-500">
                {{ stats.totalQuizCount > 0 ? stats.quizAccuracy + '%' : '--' }}
              </p>
              <p class="mt-2 text-xs font-semibold text-green-500 dark:text-green-400
                        transition-colors duration-500">
                {{ stats.totalQuizCount > 0 ? stats.totalQuizCount + ' 题作答' : '暂无数据' }}
              </p>
            </div>

            <!-- 连续学习天数 -->
            <div class="rounded-[10px] border border-[var(--color-border)]
                        bg-[var(--color-card)]
                        border-l-[3px] border-l-blue-500 dark:border-l-blue-400
                        p-4 transition-colors duration-500">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[13px] font-bold text-black dark:text-white
                             transition-colors duration-500">
                  连续学习天数
                </span>
                <div class="w-7 h-7 rounded-[10px]
                            bg-blue-50 dark:bg-blue-900/20
                            border border-blue-200/40 dark:border-blue-800/30
                            flex items-center justify-center
                            transition-colors duration-500">
                  <svg class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/>
                  </svg>
                </div>
              </div>
              <p class="mt-2.5 text-[22px] font-black text-black dark:text-white
                        transition-colors duration-500">
                {{ stats.consecutiveDays }} <span class="text-sm font-normal text-gray-400">天</span>
              </p>
              <p class="mt-2 text-xs font-semibold text-amber-500 dark:text-amber-400
                        transition-colors duration-500">
                {{ stats.consecutiveDays > 0 ? (stats.consecutiveDays >= 7 ? '太棒了！继续保持' : '坚持学习中') : '暂无数据' }}
              </p>
            </div>

          </div>
        </section>

        <!--
        ============================================================
        教材列表区域 — 仅当 activeMenu === 'courses' 时显示
        ============================================================
        -->
        <section v-if="activeMenu === 'courses'">
          <!-- 标题栏 — NERV 角括号装饰 -->
          <div class="flex items-center justify-between mb-3">
            <h2 class="flex items-center gap-2 text-black dark:text-white text-lg font-bold tracking-wide transition-colors duration-500">
              <span class="text-blue-500 dark:text-blue-400 font-mono select-none" aria-hidden="true">&#x25E4;</span>
              我的教材
              <span class="text-blue-500 dark:text-blue-400 font-mono select-none" aria-hidden="true">&#x25E2;</span>
            </h2>

            <!-- 右侧：排序下拉 + 上传按钮 -->
            <div class="flex items-center gap-3">
              <!-- 排序下拉 -->
              <el-select
                v-model="sortBy"
                placeholder="排序"
                size="default"
                class="w-[120px]"
              >
                <el-option label="默认排序" value="default" />
                <el-option label="最近上传" value="newest" />
                <el-option label="最早上传" value="oldest" />
              </el-select>

              <!-- 上传按钮：:loading 防重复点击（设计规范规则4） -->
              <el-button
                type="primary"
                :loading="isUploading"
                @click="openUploadDialog"
              >
                {{ isUploading ? '上传中...' : '上传教材' }}
              </el-button>
            </div>
          </div>

          <!-- 加载骨架屏（共6个占位卡片） -->
          <div
            v-if="loading"
            class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4"
          >
            <div
              v-for="n in 6"
              :key="n"
              class="border border-[var(--color-border)]
                     bg-[var(--color-card)]
                     rounded-[10px] overflow-hidden
                     transition-colors duration-500 animate-pulse"
            >
              <!-- 封面占位 16:9 -->
              <div class="aspect-[16/9] bg-slate-200 dark:bg-slate-700 transition-colors duration-500" />
              <!-- 内容占位 -->
              <div class="p-4 space-y-3">
                <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4
                            transition-colors duration-500" />
                <div class="h-3 bg-slate-100 dark:bg-slate-700/50 rounded w-1/2
                            transition-colors duration-500" />
                <div class="flex justify-between mt-3 pt-3
                            border-t border-slate-200 dark:border-slate-700">
                  <div class="h-6 bg-slate-100 dark:bg-slate-700/50 rounded w-16
                              transition-colors duration-500" />
                  <div class="h-6 bg-slate-100 dark:bg-slate-700/50 rounded w-12
                              transition-colors duration-500" />
                </div>
              </div>
            </div>
          </div>

          <!-- 教材卡片网格（有数据）+ 添加卡片 -->
          <div
            v-else-if="courses.length > 0"
            class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4"
          >
            <CourseCard
              v-for="course in courses"
              :key="course.id"
              :course="course"
              :progress="courseProgressMap[String(course.id)]"
              @open="onOpenCourse"
              @delete="onDeleteCourse"
            />

            <!-- ===== 添加教材卡片 — NERV 虚线边框 + hover 蓝光 ===== -->
            <div
              class="border border-dashed border-[var(--color-border)]
                     rounded-[10px] bg-[var(--color-card)]
                     min-h-[300px]
                     flex flex-col items-center justify-center gap-2
                     cursor-pointer
                     hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]
                     hover:border-blue-500 dark:hover:border-blue-400
                     transition-all duration-500"
              @click="openUploadDialog"
            >
              <!-- + 号图标 -->
              <div class="w-[46px] h-[46px] rounded-full
                          bg-blue-50 dark:bg-blue-900/20
                          border border-blue-200/40 dark:border-blue-800/30
                          flex items-center justify-center
                          text-blue-500 dark:text-blue-400 text-[22px]
                          transition-colors duration-500">
                +
              </div>
              <p class="font-extrabold text-sm text-black dark:text-white
                        transition-colors duration-500">
                添加教材
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400 text-center
                        transition-colors duration-500">
                上传教学资料，AI 自动生成课程
              </p>
            </div>
          </div>

          <!-- 空状态 -->
          <div
            v-else
            class="text-center py-20 min-h-[200px] flex flex-col items-center justify-center
                   border border-dashed border-[var(--color-border)]
                   rounded-[10px]
                   transition-colors duration-500"
          >
            <!-- 空状态图标 -->
            <svg class="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600
                        transition-colors duration-500"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            <p class="text-black dark:text-white text-base font-medium mb-1
                      transition-colors duration-500">
              还没有教材
            </p>
            <p class="text-slate-500 dark:text-slate-400 text-sm
                      transition-colors duration-500">
              点击"上传教材"按钮上传你的第一份教材
            </p>
          </div>

          <!-- 分页组件 -->
          <el-pagination
            v-if="total > pageSize"
            class="mt-6 justify-center"
            background
            layout="prev, pager, next"
            :total="total"
            :page-size="pageSize"
            :current-page="currentPage"
            @current-change="onPageChange"
          />
        </section>

        <!--
        ============================================================
        题库列表区域 — 仅当 activeMenu === 'quiz' 时显示
          - NERV 角括号装饰标题
          - 导入题库按钮
          - 题库卡片网格
          - 导入弹窗
        ============================================================
        -->
        <section v-if="activeMenu === 'quiz'">
          <!-- 标题栏 — NERV 角括号装饰 -->
          <div class="flex items-center justify-between mb-3">
            <h2 class="flex items-center gap-2 text-black dark:text-white text-lg font-bold tracking-wide transition-colors duration-500">
              <span class="text-blue-500 dark:text-blue-400 font-mono select-none" aria-hidden="true">&#x25E4;</span>
              题型训练
              <span class="text-blue-500 dark:text-blue-400 font-mono select-none" aria-hidden="true">&#x25E2;</span>
            </h2>

            <!-- 导入题库按钮 -->
            <el-button type="primary" @click="quizImportDialogVisible = true">
              导入题库
            </el-button>
          </div>

          <!-- 加载中 -->
          <div v-if="quizLoading"
               class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            <div v-for="n in 4" :key="n"
                 class="border border-[var(--color-border)] bg-[var(--color-card)]
                        rounded-[10px] h-48 animate-pulse transition-colors duration-500">
              <div class="p-4 space-y-3">
                <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4 transition-colors duration-500" />
                <div class="h-3 bg-slate-100 dark:bg-slate-700/50 rounded w-1/2 transition-colors duration-500" />
                <div class="h-8 bg-blue-100 dark:bg-blue-900/20 rounded mt-4 transition-colors duration-500" />
              </div>
            </div>
          </div>

          <!-- 题库列表 -->
          <div v-else-if="quizTextbooks.length > 0"
               class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            <QuizTextbookCard
              v-for="tb in quizTextbooks"
              :key="tb.id"
              :textbook="tb"
              :task-progress="tb.generatingTaskId ? quizProgressMap[tb.generatingTaskId] : null"
              @start="onStartQuiz"
              @start-sequential="onStartSequentialQuiz"
              @delete="onDeleteQuizTextbook"
              @share-toggled="onShareToggled"
            />
          </div>

          <!-- 空状态 -->
          <div v-else
               class="text-center py-20 min-h-[200px] flex flex-col items-center justify-center
                      border border-dashed border-[var(--color-border)] rounded-[10px]
                      transition-colors duration-500">
            <svg class="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600 transition-colors duration-500"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
            <p class="text-black dark:text-white text-base font-medium mb-1 transition-colors duration-500">
              还没有题库
            </p>
            <p class="text-slate-500 dark:text-slate-400 text-sm transition-colors duration-500">
              点击"导入题库"按钮导入 JSON 格式的题目数据
            </p>
          </div>
        </section>

        <!--
        ============================================================
        题库市场区域 — 仅当 activeMenu === 'market' 时显示
        ============================================================
        -->
        <section v-if="activeMenu === 'market'">
          <MarketPage ref="marketPageRef" />
        </section>
      </main>
    </div>

    <!-- ========== 上传教材弹窗 ========== -->
    <UploadBookDialog
      v-model:visible="uploadDialogVisible"
      @success="onUploadSuccess"
    />

    <!-- ========== 【临时】教材文件列表弹窗（未来会删除） ========== -->
    <CourseFilesDialog
      v-model:visible="courseFilesDialogVisible"
      :course-id="currentCourseId"
      :course-name="currentCourseName"
    />

    <!-- ========== 题库导入弹窗 ========== -->
    <ImportQuizDialog
      v-model:visible="quizImportDialogVisible"
      @success="onQuizImportSuccess"
    />
  </div>
</template>

<!--
============================================================
Script 引用：通过 src 属性引入同目录下的独立逻辑文件
  （与 login/ 相同的 template/script 分离模式）
============================================================
-->
<script src="./script.js"></script>
