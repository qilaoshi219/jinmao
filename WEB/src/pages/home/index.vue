<!--
============================================================================
文件名：index.vue（首页入口组件）
所属目录：src/pages/home/（home 页面的专属文件夹）
文件作用：首页的 Vue SFC 入口组件
         Template 定义页面 HTML 结构（纯视图层，无业务逻辑）
         Script 通过 <script src="./script.js"> 引用同目录下的独立逻辑文件

页面布局：参考金毛教你学的"侧边栏 + 顶部栏 + 内容区"三块式布局
设计规范：纯黑纯白文字、10px圆角、500ms过渡、Element Plus优先、暗黑双轨适配
============================================================================
-->

<template>
  <!--
  ============================================================
  全屏 flex 行布局
    - 左侧：HomeSidebar（固定宽度侧边栏）
    - 右侧：flex-1 填充剩余空间的主区域
    - 不使用 max-w 限制宽度（遵守设计规范规则5）
  ============================================================
  -->
  <div class="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-500">

    <!-- ========== 左侧侧边栏 ========== -->
    <HomeSidebar
      :user="user"
      :active-menu="activeMenu"
      @select="setActiveMenu"
      @upload="openUploadDialog"
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
      <main class="flex-1 overflow-auto p-6">

        <!--
        ============================================================
        教材列表区域
          - 标题栏 + 上传按钮
          - 骨架屏（加载态）
          - 教材卡片网格（有数据时）
          - 空状态（无数据时）
          - 分页组件
        ============================================================
        -->
        <section class="mb-8">
          <!-- 标题栏 -->
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-black dark:text-white text-xl font-bold
                       transition-colors duration-500">
              我的教材
            </h2>

            <!-- 上传按钮：:loading 防重复点击（设计规范规则4） -->
            <el-button
              type="primary"
              :loading="isUploading"
              @click="openUploadDialog"
            >
              {{ isUploading ? '上传中...' : '上传教材' }}
            </el-button>
          </div>

          <!-- 加载骨架屏（共6个占位卡片） -->
          <div
            v-if="loading"
            class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4"
          >
            <div
              v-for="n in 6"
              :key="n"
              class="border border-gray-200 dark:border-gray-700
                     bg-white dark:bg-gray-800
                     rounded-[10px] overflow-hidden
                     transition-colors duration-500 animate-pulse"
            >
              <!-- 封面占位 -->
              <div class="h-32 bg-gray-200 dark:bg-gray-700 transition-colors duration-500" />
              <!-- 内容占位 -->
              <div class="p-4 space-y-3">
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4
                            transition-colors duration-500" />
                <div class="h-3 bg-gray-100 dark:bg-gray-700/50 rounded w-1/2
                            transition-colors duration-500" />
                <div class="flex justify-between mt-3 pt-3
                            border-t border-gray-100 dark:border-gray-700">
                  <div class="h-6 bg-gray-100 dark:bg-gray-700/50 rounded w-16
                              transition-colors duration-500" />
                  <div class="h-6 bg-gray-100 dark:bg-gray-700/50 rounded w-12
                              transition-colors duration-500" />
                </div>
              </div>
            </div>
          </div>

          <!-- 教材卡片网格（有数据） -->
          <div
            v-else-if="courses.length > 0"
            class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4"
          >
            <CourseCard
              v-for="course in courses"
              :key="course.id"
              :course="course"
              @open="onOpenCourse"
              @delete="onDeleteCourse"
            />
          </div>

          <!-- 空状态 -->
          <div
            v-else
            class="text-center py-16
                   border border-dashed border-gray-300 dark:border-gray-600
                   rounded-[10px]
                   transition-colors duration-500"
          >
            <!-- 空状态图标 -->
            <svg class="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600
                        transition-colors duration-500"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            <p class="text-black dark:text-white text-base font-medium mb-1
                      transition-colors duration-500">
              还没有教材
            </p>
            <p class="text-gray-500 dark:text-gray-400 text-sm
                      transition-colors duration-500">
              点击右上角"上传教材"按钮上传你的第一份教材
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
        功能占位区（骨架，等待后续开发）
          - 学习概览统计卡片
          - 学习图表
        ============================================================
        -->
        <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- 学习概览占位 -->
          <div class="border border-dashed border-gray-200 dark:border-gray-700
                      rounded-[10px] p-8 text-center
                      bg-white dark:bg-gray-800
                      transition-colors duration-500">
            <svg class="w-10 h-10 mx-auto mb-3 text-gray-400 dark:text-gray-600
                        transition-colors duration-500"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            <p class="text-black dark:text-white font-medium mb-1
                      transition-colors duration-500">
              学习概览
            </p>
            <p class="text-gray-500 dark:text-gray-400 text-sm
                      transition-colors duration-500">
              即将上线，敬请期待
            </p>
          </div>

          <!-- 学习图表占位 -->
          <div class="border border-dashed border-gray-200 dark:border-gray-700
                      rounded-[10px] p-8 text-center
                      bg-white dark:bg-gray-800
                      transition-colors duration-500">
            <svg class="w-10 h-10 mx-auto mb-3 text-gray-400 dark:text-gray-600
                        transition-colors duration-500"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                    d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <p class="text-black dark:text-white font-medium mb-1
                      transition-colors duration-500">
              学习统计
            </p>
            <p class="text-gray-500 dark:text-gray-400 text-sm
                      transition-colors duration-500">
              即将上线，敬请期待
            </p>
          </div>
        </section>
      </main>
    </div>

    <!-- ========== 上传教材弹窗 ========== -->
    <UploadBookDialog
      v-model:visible="uploadDialogVisible"
      @success="onUploadSuccess"
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
