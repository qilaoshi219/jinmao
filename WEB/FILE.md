# FILE.md - WEB 前端项目文件索引

> 最后更新：2026-07-06

## 项目目录结构

```
WEB/
├── public/                          # 静态资源（不经过构建）
│   └── favicon.ico                  # 网站图标
├── src/
│   ├── api/                         # API 请求层
│   │   ├── client.js                # Axios 实例（baseURL、拦截器、Token 注入、401 处理）
│   │   ├── auth.js                  # 认证相关 API：sendCode、login、getProfile、updateProfile
│   │   └── books.js                 # 教材相关 API：uploadBook、listBooks、getBookDetail、getBookStatus
│   ├── composables/                 # 组合式函数（Composables）
│   │   └── useTheme.js              # 主题切换：封装 VueUse useDark，导出 isDark 和 toggleTheme
│   ├── pages/                       # 页面组件（每个页面一个独立子文件夹）
│   │   ├── login/                    # 登录注册页面专属文件夹
│   │   │   ├── index.vue             # 登录页入口：Element Plus 组件 + Tailwind 布局（符合 design-spec）
│   │   │   └── script.js             # 登录页逻辑：isSending/isSubmitting 独立 loading 状态
│   │   └── home/                     # 首页专属文件夹（2026-07-06 新建）
│   │       ├── index.vue             # 首页入口：全屏flex三块式布局（侧边栏+顶部栏+内容区）
│   │       └── script.js             # 首页逻辑：教材列表加载、上传/删除、状态轮询、用户信息
│   ├── components/                  # 可复用组件
│   │   ├── HomeSidebar.vue          # 首页侧边栏：品牌LOGO、导航菜单（骨架占位）、用户信息（2026-07-06 新建）
│   │   ├── HomeTopbar.vue           # 首页顶部栏：搜索框（占位）、主题切换、用户头像、退出（2026-07-06 新建）
│   │   ├── CourseCard.vue           # 教材卡片：封面渐变、状态标签、名称、操作按钮（2026-07-06 新建）
│   │   └── UploadBookDialog.vue     # 上传弹窗：el-upload拖拽、格式校验、loading防重复（2026-07-06 新建）
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
├── 开发日志.md                       # 前端开发日志
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
| `src/api/books.js` | 教材 API：uploadBook、listBooks、getBookDetail、getBookStatus | `client.js` | 2026-07-06 |
| `src/composables/useTheme.js` | 主题切换 Composable：封装 VueUse useDark | `@vueuse/core` | 2026-07-06 |
| `src/stores/auth.js` | Pinia 认证 Store：token/user/isLoggedIn/login/logout/fetchProfile | `api/auth.js`, `utils/storage.js` | 2026-07-06 |
| `src/utils/storage.js` | localStorage 封装：getToken/setToken/removeToken | - | 2026-07-06 |
| `src/styles/index.css` | 全局样式入口：Tailwind + 暗黑模式 + tokens | `tokens.css` | 2026-07-06 |
| `src/styles/tokens.css` | 主题 CSS 变量：亮/暗两套 + fallback | - | 2026-07-06 |
| `src/pages/login/index.vue` | 登录页模板：Element Plus + Tailwind 美化版 | `script.js` | 2026-07-06 |
| `src/pages/login/script.js` | 登录页逻辑：验证码发送、登录、表单校验 | `api/auth.js`, `stores/auth.js` | 2026-07-06 |
| `src/pages/home/index.vue` | **首页模板**：侧边栏+顶部栏+内容区三块式布局 | `script.js` | **2026-07-06 新建** |
| `src/pages/home/script.js` | **首页逻辑**：教材列表、上传/删除、状态轮询、用户信息 | `api/books.js`, `api/auth.js`, `stores/auth.js` | **2026-07-06 新建** |
| `src/components/HomeSidebar.vue` | **首页侧边栏**：品牌LOGO、导航菜单（骨架）、用户信息 | - | **2026-07-06 新建** |
| `src/components/HomeTopbar.vue` | **首页顶部栏**：搜索框（占位）、主题切换、用户头像 | `composables/useTheme.js` | **2026-07-06 新建** |
| `src/components/CourseCard.vue` | **教材卡片**：封面、状态标签、操作按钮 | - | **2026-07-06 新建** |
| `src/components/UploadBookDialog.vue` | **上传弹窗**：el-upload拖拽、格式校验、loading防重复 | `api/books.js` | **2026-07-06 新建** |
| `vite.config.js` | Vite 配置：端口30000、API代理8888、Element Plus自动导入 | - | 2026-07-06 |
| `start.ps1` | 快速启动脚本：检查端口、安装依赖、启动 Vite | - | 2026-07-06 |
