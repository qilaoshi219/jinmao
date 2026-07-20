// ==================== PM2 进程管理配置 ====================
// 用途：为宝塔 PM2 管理器提供标准化的启动配置
//
// 使用方式：
//   方式一（宝塔面板）：
//     宝塔 → 软件商店 → PM2管理器 → 添加项目
//     → 启动文件选择 app.js，运行目录选择当前目录
//
//   方式二（命令行）：
//     pm2 start ecosystem.config.js
//
//   方式三（手动指定）：
//     pm2 start app.js --name jinmao-backend --cwd .
//
// 最后修改：2026-07-09
// ====================

module.exports = {
  apps: [
    {
      // 项目名称（宝塔面板中显示的名称，也用于 pm2 logs 等命令）
      name: "jinmao-backend",

      // 启动脚本（Express 入口文件，相对于 cwd 的路径）
      script: "./app.js",

      // 工作目录（package.json 和 .env 所在的目录）
      cwd: __dirname,

      // Node.js 额外参数（此处不额外传参）
      node_args: "",

      // 进程实例数（1 表示单实例，生产环境一般不需要集群模式）
      instances: 1,

      // 执行模式：fork 适合单进程，cluster 适合多核负载均衡
      exec_mode: "fork",

      // 环境变量注入（生产环境标识 + 端口号）
      env: {
        NODE_ENV: "production",
        PORT: 8888,
      },

      // ========== 自动重启策略 ==========
      // 进程异常退出时自动重启
      autorestart: true,

      // 最多连续重启 10 次（防止死循环重启）
      max_restarts: 10,

      // 重启前等待 3 秒（给数据库等依赖服务恢复时间）
      restart_delay: 3000,

      // ========== 日志配置 ==========
      // 日志时间格式
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // 标准输出日志文件（相对于 cwd 的路径）
      out_file: "./logs/pm2-out.log",

      // 错误输出日志文件
      error_file: "./logs/pm2-error.log",

      // 合并 stdout 和 stderr 到同一个文件
      merge_logs: true,

      // ========== 内存限制 ==========
      // 内存超过 500MB 时自动重启，防止内存泄漏导致服务器崩溃
      max_memory_restart: "500M",

      // ========== 文件监听 ==========
      // 生产环境关闭文件监听，避免不必要的重启
      watch: false,

      // 忽略监听的文件/目录（即使 watch 设为 true 也跳过）
      ignore_watch: [
        "node_modules",
        "logs",
        "*.log",
        ".backend.log",
        ".backend.pid",
      ],
    },
  ],
};
