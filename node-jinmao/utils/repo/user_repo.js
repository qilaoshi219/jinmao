// ==================== 用户 Repository 模块 ====================
// 职责：封装对 User 表的数据库操作，提供统一的数据访问接口
// 所有查询默认过滤 isDeleted: false，确保软删除用户不被检索
// 使用 Prisma Client 进行类型安全的数据库操作

// 引入 Prisma 单例实例
const prisma = require("../prisma");

// ==================== 导出函数 ====================

/**
 * 根据邮箱查询用户（包含 password 字段，用于业务层判断）
 * 默认过滤已软删除的用户
 * @param {string} email - 用户邮箱地址
 * @returns {Promise<{ code: number, user?: Object, message?: string }>}
 *   - code 200: 查询成功，user 为用户对象（含所有字段）
 *   - code 404: 用户不存在
 *   - code 500: 数据库查询异常
 */
async function findByEmail(email) {
  console.log("[user_repo][findByEmail] 查询邮箱: " + email);

  try {
    // 使用 Prisma findUnique 查询唯一邮箱
    // 同时过滤 isDeleted: false，排除已软删除的用户
    const user = await prisma.user.findUnique({
      where: {
        email: email,
        isDeleted: false, // 只查询未删除的用户
      },
    });

    // 用户不存在
    if (!user) {
      console.log("[user_repo][findByEmail] 用户不存在，邮箱: " + email);
      return { code: 404, message: "用户不存在。" };
    }

    console.log("[user_repo][findByEmail] 用户查询成功，ID: " + user.id);
    return { code: 200, user: user };
  } catch (error) {
    // 数据库异常捕获
    console.error("[user_repo][findByEmail] 数据库查询异常: " + error.message);
    return {
      code: 500,
      message: "数据库查询异常: " + error.message,
    };
  }
}

/**
 * 通过邮箱创建新用户（仅邮箱注册，无密码、无用户名、无昵称）
 * 用于验证码登录时首次注册的无密码用户
 * @param {string} email - 用户邮箱地址
 * @returns {Promise<{ code: number, user?: Object, message?: string }>}
 *   - code 200: 创建成功，user 为新创建的用户对象
 *   - code 500: 数据库创建异常
 */
async function createByEmail(email) {
  console.log("[user_repo][createByEmail] 创建新用户，邮箱: " + email);

  try {
    // 使用 Prisma create 创建用户
    // username、password、nickname 均为 NULL（纯验证码登录用户）
    const user = await prisma.user.create({
      data: {
        email: email, // 仅设置邮箱
        role: "user", // 默认角色为普通用户
      },
    });

    console.log("[user_repo][createByEmail] 新用户创建成功，ID: " + user.id);
    return { code: 200, user: user };
  } catch (error) {
    // 数据库异常捕获（如邮箱重复导致的唯一约束冲突）
    console.error("[user_repo][createByEmail] 数据库创建异常: " + error.message);
    return {
      code: 500,
      message: "用户创建异常: " + error.message,
    };
  }
}

/**
 * 根据用户 ID 查询用户（包含 password 等所有字段，供 Service 层进一步处理）
 * 默认过滤已软删除的用户
 * @param {string} userId - 用户 ID（字符串类型，从 JWT payload 获取）
 * @returns {Promise<{ code: number, user?: Object, message?: string }>}
 *   - code 200: 查询成功，user 为用户完整对象
 *   - code 404: 用户不存在（已删除或不存在）
 *   - code 500: 数据库查询异常
 */
async function findById(userId) {
  console.log("[user_repo][findById] 查询用户ID: " + userId);

  try {
    // userId 从 JWT payload 取出是 String 类型，需转为 BigInt 查询
    const id = BigInt(userId);
    const user = await prisma.user.findUnique({
      where: {
        id: id,
        isDeleted: false, // 只查询未删除的用户
      },
    });

    // 用户不存在（已删除或 ID 无效）
    if (!user) {
      console.log("[user_repo][findById] 用户不存在，ID: " + userId);
      return { code: 404, message: "用户不存在。" };
    }

    console.log("[user_repo][findById] 用户查询成功，ID: " + user.id + "，邮箱: " + user.email);
    return { code: 200, user: user };
  } catch (error) {
    // 数据库异常捕获
    console.error("[user_repo][findById] 数据库查询异常: " + error.message);
    return {
      code: 500,
      message: "数据库查询异常: " + error.message,
    };
  }
}

/**
 * 更新用户个人信息（仅更新传入的非空字段）
 * 默认仅更新未删除的用户
 * @param {string} userId - 用户 ID（字符串类型，从 JWT payload 获取）
 * @param {Object} fields - 要更新的字段对象，如 { nickname, phone, password }
 * @returns {Promise<{ code: number, user?: Object, message?: string }>}
 *   - code 200: 更新成功，user 为更新后的用户对象
 *   - code 404: 用户不存在（已删除或 ID 无效）
 *   - code 500: 数据库更新异常
 */
async function updateProfile(userId, fields) {
  console.log("[user_repo][updateProfile] 开始更新用户信息，ID: " + userId + "，更新字段: " + Object.keys(fields).join(", "));

  try {
    // userId 从 JWT payload 取出是 String 类型，需转为 BigInt 查询
    const id = BigInt(userId);

    // 使用 Prisma update 更新用户，where 条件同时过滤 isDeleted
    const user = await prisma.user.update({
      where: {
        id: id,
        isDeleted: false, // 只更新未删除的用户
      },
      data: fields, // 仅更新传入的字段，Prisma 自动忽略 undefined
    });

    console.log("[user_repo][updateProfile] 用户信息更新成功，ID: " + user.id + "，邮箱: " + user.email);
    return { code: 200, user: user };
  } catch (error) {
    // 处理 Prisma 特定错误：记录不存在的错误码
    if (error.code === "P2025") {
      console.log("[user_repo][updateProfile] 用户不存在（已删除或 ID 无效），ID: " + userId);
      return { code: 404, message: "用户不存在。" };
    }

    // 其他数据库异常
    console.error("[user_repo][updateProfile] 数据库更新异常: " + error.message);
    return {
      code: 500,
      message: "数据库更新异常: " + error.message,
    };
  }
}

// ==================== 余额相关操作 ====================

/**
 * 原子扣减用户余额（使用 Prisma decrement 避免并发竞态）
 * @param {string} userId - 用户 ID（字符串类型）
 * @param {number} amount - 扣减金额（正数，单位：元）
 * @returns {Promise<{ code: number, newBalance?: string, message?: string }>}
 *   - code 200: 扣减成功
 *   - code 404: 用户不存在
 *   - code 500: 数据库异常
 */
async function deductBalance(userId, amount) {
  console.log("[user_repo][deductBalance] 用户 " + userId + " 扣减余额 ¥" + amount.toFixed(6));

  try {
    const id = BigInt(userId);
    const updatedUser = await prisma.user.update({
      where: { id: id, isDeleted: false },
      data: { balance: { decrement: amount } },
      select: { balance: true },
    });

    const newBalance = String(updatedUser.balance);
    console.log("[user_repo][deductBalance] 扣减成功，新余额: ¥" + parseFloat(newBalance).toFixed(6));
    return { code: 200, newBalance: newBalance };
  } catch (error) {
    if (error.code === "P2025") {
      console.log("[user_repo][deductBalance] 用户不存在，ID: " + userId);
      return { code: 404, message: "用户不存在。" };
    }
    console.error("[user_repo][deductBalance] 数据库异常: " + error.message);
    return { code: 500, message: "扣减余额异常: " + error.message };
  }
}

/**
 * 设置用户余额锁定状态
 * @param {string} userId - 用户 ID（字符串类型）
 * @param {boolean} locked - 是否锁定（true=锁定, false=解锁）
 * @returns {Promise<{ code: number, message?: string }>}
 */
async function setBalanceLocked(userId, locked) {
  console.log("[user_repo][setBalanceLocked] 用户 " + userId + " 设置锁定状态: " + locked);

  try {
    const id = BigInt(userId);
    await prisma.user.update({
      where: { id: id, isDeleted: false },
      data: { balanceLocked: locked },
    });
    console.log("[user_repo][setBalanceLocked] 锁定状态更新成功");
    return { code: 200 };
  } catch (error) {
    if (error.code === "P2025") {
      console.log("[user_repo][setBalanceLocked] 用户不存在，ID: " + userId);
      return { code: 404, message: "用户不存在。" };
    }
    console.error("[user_repo][setBalanceLocked] 数据库异常: " + error.message);
    return { code: 500, message: "更新锁定状态异常: " + error.message };
  }
}

/**
 * 获取用户余额状态（余额 + 锁定状态）
 * @param {string} userId - 用户 ID（字符串类型）
 * @returns {Promise<{ code: number, balance?: string, balanceLocked?: boolean, message?: string }>}
 */
async function getBalanceState(userId) {
  console.log("[user_repo][getBalanceState] 查询用户 " + userId + " 余额状态");

  try {
    const id = BigInt(userId);
    const user = await prisma.user.findUnique({
      where: { id: id, isDeleted: false },
      select: { balance: true, balanceLocked: true },
    });

    if (!user) {
      console.log("[user_repo][getBalanceState] 用户不存在，ID: " + userId);
      return { code: 404, message: "用户不存在。" };
    }

    console.log("[user_repo][getBalanceState] 余额: ¥" + String(user.balance) + ", 锁定: " + user.balanceLocked);
    return { code: 200, balance: String(user.balance), balanceLocked: user.balanceLocked };
  } catch (error) {
    console.error("[user_repo][getBalanceState] 数据库异常: " + error.message);
    return { code: 500, message: "查询余额状态异常: " + error.message };
  }
}

// 导出模块函数
module.exports = {
  findByEmail,
  createByEmail,
  findById,
  updateProfile,
  // 余额相关操作
  deductBalance,
  setBalanceLocked,
  getBalanceState,
};
