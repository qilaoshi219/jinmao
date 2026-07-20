// 临时测试脚本 - 测试数据库连接
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const start = Date.now();
p.$connect()
  .then(() => {
    console.log("DB OK (" + (Date.now() - start) + "ms)");
    return p.$disconnect();
  })
  .catch((e) => {
    console.error("DB FAIL (" + (Date.now() - start) + "ms):", e.message);
  });
