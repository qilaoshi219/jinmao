# FILE.md - WEB 前端项目文件索引

> 最后更新：2026-08-02

## 项目目录结构

```
WEB/
├── public/                          # 静态资源（不经过构建）
│   └── favicon.svg                  # 网站图标（金色书本，index.html 引用 /favicon.svg）（2026-08-02 新建）
├── src/
│   ├── api/                         # API 请求层
│   │   ├── client.js                # Axios 实例（baseURL、拦截器、Token 注入、401 处理）
│   │   ├── auth.js                  # 认证相关 API：sendCode、login、getProfile、updateProfile
│   │   ├── billing.js               # 账单相关 API：getBilling（获取用户账务摘要+扣费记录分页列表）（2026-07-29 新建）
│   │   └── books.js                 # 教材相关 API：uploadBook、listBooks、getBookDetail、getBookStatus
│   ├── composables/                 # 组合式函数（Composables）
│   │   └── useTheme.js              # 主题切换：封装 VueUse useDark，导出 isDark 和 toggleTheme
│   ├── pages/                       # 页面组件（每个页面一个独立子文件夹）
│   │   ├── login/                    # 登录注册页面专属文件夹
│   │   │   ├── index.vue             # 登录页入口：Element Plus 组件 + Tailwind 布局（符合 design-spec）
│   │   │   └── script.js             # 登录页逻辑：isSending/isSubmitting 独立 loading 状态
│   │   ├── home/                     # 首页专属文件夹（2026-07-06 新建）
│   │   │   ├── index.vue             # 首页入口：全屏flex三块式布局（侧边栏+顶部栏+内容区）
│   │   │   └── script.js             # 首页逻辑：教材列表加载、上传/删除、状态轮询、用户信息
│   │   ├── billing/                  # 账单页面专属文件夹（2026-07-29 新建）
│   │   │   ├── index.vue             # 账单页入口：VIP/计划/余额/已用金额卡片 + 扣费明细表格 + 分页
│   │   │   └── script.js             # 账单页逻辑：数据加载、分页、金额格式化、"去充值"按钮
│   │   ├── study/                    # 课程学习页专属文件夹
│   │   │   ├── index.vue             # 学习页入口：三栏可拖动布局（PPT + 音频 + 字幕）
│   │   │   └── script.js             # 学习页逻辑：章节切换、播放控制、进度保存
│   │   └── quiz/                     # 刷题页专属文件夹
│   │       ├── index.vue             # 刷题页入口：答题区 + 答题卡 + 底部栏
│   │       ├── script.js             # 刷题页逻辑：会话管理、作答保存、SSE 判题
│   │       ├── report.vue            # 报告页入口：分数环 + 统计卡 + 题目解析
│   │       └── report-script.js      # 报告页逻辑：图表计算、判题进度展示
│   │   ├── mobile-home/              # 手机端首页专属文件夹（2026-07-31 新建）
│   │   │   ├── index.vue             # 手机端首页：品牌区+搜索框+4宫格+继续学习列表
│   │   │   └── script.js             # 手机端首页逻辑：用户/教材/进度/余额加载、搜索过滤、导航
│   │   ├── mobile-profile/           # 手机端个人中心专属文件夹（2026-07-31 新建）
│   │   │   ├── index.vue             # 手机端个人中心：用户卡片+功能菜单+深色模式+退出
│   │   │   └── script.js             # 手机端个人中心逻辑：导航、主题切换、退出登录
│   ├── components/                  # 可复用组件
│   │   ├── HomeSidebar.vue          # 首页侧边栏：品牌LOGO、导航菜单（骨架占位）、用户信息（2026-07-06 新建）
│   │   ├── HomeTopbar.vue           # 首页顶部栏：搜索框（占位）、主题切换、用户头像、退出（2026-07-06 新建）
│   │   ├── CourseCard.vue           # 教材卡片：封面渐变、状态标签、名称、操作按钮（2026-07-06 新建）
│   │   └── UploadBookDialog.vue     # 上传弹窗：el-upload拖拽、格式校验、loading防重复（2026-07-06 新建）
│   │   ├── mobile/                   # 手机端专属组件（2026-07-31 新建）
│   │   │   ├── MobileQuickActionGrid.vue  # 手机端首页4宫格快捷入口
│   │   │   └── MobileCourseListCard.vue   # 手机端课程列表卡片（封面+进度+按钮）
│   ├── stores/                      # Pinia 状态管理
│   │   └── auth.js                  # 认证 Store：token、user、isLoggedIn、login、fetchProfile、logout
│   ├── utils/                       # 前端工具函数
│   │   └── storage.js               # localStorage 封装：getToken/setToken/removeToken + 通用 get/set/remove
│   ├── styles/                      # 全局样式
│   │   ├── index.css                # 全局样式入口：Tailwind CSS + 暗黑模式 class 策略 + tokens 导入
│   │   └── tokens.css               # 主题 CSS 变量：:root 和 .dark 两套变量 + prefers-color-scheme fallback
│   ├── App.vue                      # 根组件（根据登录状态切换 LoginPage 和 HomePage）
│   └── main.js                      # 入口文件（createApp + Pinia + 挂载）
├── index.html                       # HTML 入口文件（<div id="app"> 挂载点）
├── package.json                     # 项目依赖与脚本
├── vite.config.js                   # Vite 构建配置（端口30000、API代理、Element Plus按需导入）
├── start.ps1                        # 前端快速启动脚本
├── FILE.md                          # 本文件：文件索引
├── .gitignore
└── .vscode/
    └── extensions.json              # VS Code 推荐扩展
```

## 文件功能说明

| 文件路径 | 作用 | 依赖/关联 | 最后修改 |
|----------|------|-----------|----------|
| `index.html` | HTML 入口，提供 `<div id="app">` 挂载点 | `src/main.js` | 2026-07-06 |
| `src/main.js` | JS 入口：创建 Vue App、注册 Pinia、引入 Element Plus 暗黑模式 | `App.vue`, `stores/auth.js` | 2026-07-06 |
| `src/App.vue` | 根组件：`v-if` 条件渲染切换 LoginPage 和 HomePage | `pages/login/`, `pages/home/` | 2026-07-06 |
| `src/api/client.js` | Axios 统一实例：baseURL `/api/v1`、Token 自动注入、401 处理 | - | 2026-07-06 |
| `src/api/auth.js` | 认证 API：sendCode、login、getProfile、updateProfile | `client.js` | 2026-07-06 |
| `src/api/books.js` | 教材 API：uploadBook、listBooks、getBookDetail、getBookStatus、getGenerateNextStatus | `client.js` | **2026-08-03 修改** |
| `src/composables/useTheme.js` | 主题切换 Composable：封装 VueUse useDark | `@vueuse/core` | 2026-07-06 |
| `src/stores/auth.js` | Pinia 认证 Store：token/user/isLoggedIn/login/logout/fetchProfile | `api/auth.js`, `utils/storage.js` | 2026-07-06 |
| `src/utils/storage.js` | localStorage 封装：getToken/setToken/removeToken | - | 2026-07-06 |
| `src/styles/index.css` | 全局样式入口：Tailwind + 暗黑模式 + tokens | `tokens.css` | 2026-07-06 |
| `src/styles/tokens.css` | 主题 CSS 变量：亮/暗两套 + fallback | - | 2026-07-06 |
| `src/pages/login/index.vue` | 登录页模板：左右两栏卡片布局（Hero + 登录表单） | `script.js` | **2026-07-09 重构** |
| `src/pages/login/script.js` | 登录页逻辑：验证码发送、登录、表单校验 | `api/auth.js`, `stores/auth.js` | 2026-07-06 |
| `src/pages/home/index.vue` | **首页模板**：统计卡片+教材列表+排序+添加卡片 | `script.js` | **2026-07-09 重构** |
| `src/pages/home/script.js` | **首页逻辑**：教材列表、上传/删除、状态轮询、用户信息、排序 | `api/books.js`, `api/auth.js`, `stores/auth.js` | **2026-07-09 修改** |
| `src/pages/billing/index.vue` | **账单页模板**：VIP/计划/余额/已用金额卡片 + 扣费明细表格 + 分页 + "去兑换码"按钮（跳转兑换码页面） | `script.js` | **修改 2026-08-01** |
| `src/pages/billing/script.js` | **账单页逻辑**：数据加载、分页、金额格式化、返回导航、跳转兑换码页 goRedeem | `api/billing.js` | **修改 2026-08-01** |
| `src/api/billing.js` | 账单 API：getBilling（获取用户账务摘要+扣费记录分页列表） | `client.js` | **新建 2026-07-29** |
| `src/components/HomeSidebar.vue` | **首页侧边栏**：品牌LOGO+徽章+上传按钮+分隔线+主次菜单+用户+余额入口 | `api/billing.js` | **修改 2026-07-29** |
| `src/components/HomeTopbar.vue` | **首页顶部栏**：搜索框+通知铃铛+主题切换+用户下拉菜单 | `composables/useTheme.js` | **2026-07-09 重构** |
| `src/components/CourseCard.vue` | **教材卡片**：16:9封面+遮罩层+进度条+三点操作菜单 | - | **2026-07-09 重构** |
| `src/components/UploadBookDialog.vue` | **上传弹窗**：左右两栏（模式选择+上传区）+AI模型选择+860px宽 | `api/books.js` | **2026-07-09 重构** |
| `src/pages/mobile-home/index.vue` | **手机端首页模板**：品牌区+搜索框+4宫格+继续学习列表 | `script.js` | **新建 2026-07-31** |
| `src/pages/mobile-home/script.js` | **手机端首页逻辑**：用户/教材/进度/余额并行加载、本地搜索过滤、快捷入口分发 | `api/books.js`, `api/progress.js`, `api/billing.js` | **新建 2026-07-31** |
| `src/pages/mobile-profile/index.vue` | **手机端个人中心模板**：用户卡片+个人资料/余额/深色模式/退出 | `script.js` | **新建 2026-07-31** |
| `src/pages/mobile-profile/script.js` | **手机端个人中心逻辑**：导航、主题切换、退出登录确认 | `stores/auth.js`, `composables/useTheme.js` | **新建 2026-07-31** |
| `src/components/mobile/MobileQuickActionGrid.vue` | **手机端快捷入口宫格**：4 个固定入口按钮（我的教材/习题训练/题库市场/我的余额） | - | **新建 2026-07-31** |
| `src/components/mobile/MobileCourseListCard.vue` | **手机端课程列表卡片**：封面占位+教材名+章节进度+进度条+操作按钮 | - | **新建 2026-07-31** |
| `src/App.vue` | **根组件**：扩展 `/mobile` 和 `/mobile/profile` 路径路由，popstate 监听 | `pages/mobile-home/`, `pages/mobile-profile/` | **修改 2026-07-31** |
| `vite.config.js` | Vite 配置：端口30000、API代理8888、Element Plus自动导入 | - | 2026-07-06 |
| `start.ps1` | 快速启动脚本：检查端口、安装依赖、启动 Vite | - | 2026-07-06 |
