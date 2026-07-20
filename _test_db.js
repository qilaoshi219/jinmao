require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.$connect().then(() => {
  console.log("Prisma OK");
  return p.$disconnect();
}).catch(e => console.error("Prisma FAIL:", e.message));
