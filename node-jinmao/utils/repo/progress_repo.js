// ==================== 学习进度 Repository 模块 ====================
// 职责：封装对 UserStudyRecord 表的数据库操作，提供统一的数据访问接口
// 所有查询默认过滤 isDeleted: false，确保软删除记录不被检索
// 使用 Prisma Client 进行类型安全的数据库操作

// 引入 Prisma 单例实例
const prisma = require("../prisma");

// 日志前缀
const TAG = "[progress_repo]";

// ==================== 模块加载时模型完整性校验 ====================
// 验证 Prisma Client 是否包含 UserStudyRecord 模型
// 如果模型为 undefined，说明 Prisma Client 是用旧版 schema 生成的（未包含 UserStudyRecord）
// 需要在服务器上运行 npx prisma generate 重新生成
if (!prisma.userStudyRecord) {
  console.error(TAG + " ❌ Prisma Client 缺少 UserStudyRecord 模型！");
  console.error(TAG + "    这通常是因为服务器上的 Prisma Client 是用旧版 schema 生成的。");
  console.error(TAG + "    请在服务器上运行 npx prisma generate 重新生成 Prisma Client。");
}

// ==================== 导出函数 ====================

/**
 * 保存或更新用户学习进度（upsert 模式）
 * 利用联合唯一约束 (user_id, course_id, chapter_id) 实现：
 *   - 不存在记录 → 创建新记录
 *   - 已存在记录 → 更新 progress 和 updateTime
 * @param {string} userId - 用户 ID（字符串类型，从 JWT payload 获取）
 * @param {string} courseId - 课程 ID
 * @param {string} chapterId - 章节 ID
 * @param {number} progress - 页码（1-based）
 * @returns {Promise<{ code: number, data?: Object, message?: string }>}
 *   - code 200: 保存成功，data 为保存后的记录
 *   - code 500: 数据库异常
 */
async function upsertProgress(userId, courseId, chapterId, progress) {
  console.log(TAG + "[upsertProgress] 保存学习进度，userId: " + userId + "，courseId: " + courseId + "，chapterId: " + chapterId + "，progress: " + progress);

  try {
    // 将字符串类型的 ID 转换为 BigInt
    const uid = BigInt(userId);
    const cid = BigInt(courseId);
    const chid = BigInt(chapterId);

    // 使用 Prisma upsert 实现"存在则更新，不存在则创建"
    // where 条件使用联合唯一约束
    const record = await prisma.userStudyRecord.upsert({
      where: {
        userId_courseId_chapterId: {
          userId: uid,
          courseId: cid,
          chapterId: chid,
        },
      },
      create: {
        userId: uid,
        courseId: cid,
        chapterId: chid,
        progress: progress,
      },
      update: {
        progress: progress, // 更新页码
        isDeleted: false,   // 如果之前被软删除，恢复记录
      },
    });

    console.log(TAG + "[upsertProgress] 学习进度保存成功，记录ID: " + record.id + "，页码: " + record.progress);

    return {
      code: 200,
      data: {
        id: String(record.id),
        courseId: String(record.courseId),
        chapterId: String(record.chapterId),
        progress: record.progress,
        updateTime: record.updateTime,
      },
    };
  } catch (error) {
    console.error(TAG + "[upsertProgress] 数据库异常: " + error.message);
    return {
      code: 500,
      message: "保存学习进度时发生数据库异常: " + error.message,
    };
  }
}

/**
 * 获取用户在指定课程的最新学习进度
 * 返回该课程下 updateTime 最新的一条记录（即用户最后学习的章节和页码）
 * @param {string} userId - 用户 ID
 * @param {string} courseId - 课程 ID
 * @returns {Promise<{ code: number, data?: Object, message?: string }>}
 *   - code 200: 查询成功，data 为进度记录（含 chapterId, progress, chapterName, totalPages）
 *   - code 404: 没有学习记录
 *   - code 500: 数据库异常
 */
async function getProgress(userId, courseId) {
  console.log(TAG + "[getProgress] 查询学习进度，userId: " + userId + "，courseId: " + courseId);

  try {
    const uid = BigInt(userId);
    const cid = BigInt(courseId);

    // 查询该课程下所有未删除的学习记录，按更新时间降序，取第一条（最新）
    const record = await prisma.userStudyRecord.findFirst({
      where: {
        userId: uid,
        courseId: cid,
        isDeleted: false,
      },
      orderBy: {
        updateTime: "desc", // 最新的记录排在最前
      },
      include: {
        chapter: {
          select: {
            name: true,      // 章节名称
            totalPages: true, // 章节总页数（用于前端判断进度是否合理）
          },
        },
      },
    });

    // 没有找到记录
    if (!record) {
      console.log(TAG + "[getProgress] 没有找到学习记录，userId: " + userId + "，courseId: " + courseId);
      return { code: 404, message: "没有找到该课程的学习记录。" };
    }

    console.log(TAG + "[getProgress] 学习记录查询成功，章节: " + record.chapter.name + "，页码: " + record.progress);

    return {
      code: 200,
      data: {
        courseId: String(record.courseId),
        chapterId: String(record.chapterId),
        chapterName: record.chapter.name,
        progress: record.progress,
        totalPages: record.chapter.totalPages,
        updateTime: record.updateTime,
      },
    };
  } catch (error) {
    console.error(TAG + "[getProgress] 数据库异常: " + error.message);
    return {
      code: 500,
      message: "查询学习进度时发生数据库异常: " + error.message,
    };
  }
}

/**
 * 获取用户所有课程的学习进度摘要
 * 对每个课程，返回最后学习的章节和页码
 * 用于首页"继续学习"功能
 * @param {string} userId - 用户 ID
 * @returns {Promise<{ code: number, data?: Array, message?: string }>}
 *   - code 200: 查询成功，data 为进度摘要数组
 *   - code 500: 数据库异常
 */
async function getAllProgress(userId) {
  console.log(TAG + "[getAllProgress] 查询所有课程学习进度，userId: " + userId);

  try {
    const uid = BigInt(userId);

    // 查询该用户所有未删除的学习记录，按更新时间降序排列
    const records = await prisma.userStudyRecord.findMany({
      where: {
        userId: uid,
        isDeleted: false,
      },
      orderBy: {
        updateTime: "desc",
      },
      include: {
        course: {
          select: {
            name: true, // 课程名称
          },
        },
        chapter: {
          select: {
            name: true,      // 章节名称
            totalPages: true, // 章节总页数
          },
        },
      },
    });

    console.log(TAG + "[getAllProgress] 查询到 " + records.length + " 条学习记录");

    // 映射为前端需要的格式
    const data = records.map((record) => ({
      courseId: String(record.courseId),
      courseName: record.course.name,
      chapterId: String(record.chapterId),
      chapterName: record.chapter.name,
      progress: record.progress,
      totalPages: record.chapter.totalPages,
      updateTime: record.updateTime,
    }));

    return { code: 200, data };
  } catch (error) {
    console.error(TAG + "[getAllProgress] 数据库异常: " + error.message);
    return {
      code: 500,
      message: "查询所有学习进度时发生数据库异常: " + error.message,
    };
  }
}

// 导出模块函数
module.exports = {
  upsertProgress,
  getProgress,
  getAllProgress,
};
