// ==================== Prisma Client 单例模块 ====================
// 职责：创建并导出全局唯一的 Prisma Client 实例，确保整个应用共享同一个数据库连接池
// 使用单例模式避免多次实例化导致的连接泄漏

const { PrismaClient } = require("@prisma/client");

// 创建 Prisma Client 实例
// 使用 try-catch 保护，防止数据库连接失败导致应用崩溃
let prisma;
try {
  prisma = new PrismaClient({
    // 开发模式下开启查询日志，方便调试 SQL 语句
    log: process.env.NODE_ENV === "development" ? ["query", "info", "warn", "error"] : ["error"],
  });
  console.log("[prisma] Prisma Client 实例已创建。");
} catch (error) {
  console.error("[prisma] Prisma Client 创建失败: " + error.message);
  // 创建一个虚拟实例，让后续代码不会因 undefined 报错
  // 实际数据库操作时会在 user_repo 层捕获并返回错误
  prisma = new Proxy(
    {},
    {
      get() {
        throw new Error("[prisma] Prisma Client 未正确初始化，请检查 DATABASE_URL 配置。");
      },
    }
  );
}

// 导出全局唯一的 prisma 实例
module.exports = prisma;
