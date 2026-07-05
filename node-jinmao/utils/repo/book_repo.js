// ==================== 教材 Repository 模块 ====================
// 职责：封装对 Course 表的数据库操作，提供统一的数据访问接口
// 所有查询默认过滤 isDeleted: false，确保软删除记录不被检索
// 使用 Prisma Client 进行类型安全的数据库操作

// 引入 Prisma 单例实例
const prisma = require("../prisma");

// ==================== 导出函数 ====================

/**
 * 创建课程记录
 * @param {Object} data - 课程数据
 * @param {string} data.userId - 用户 ID
 * @param {string} data.name - 课程名称
 * @param {string|null} data.description - 课程描述
 * @param {string} data.textbookFilename - 教材原文件名
 * @param {string} data.textbookPath - 归一化 MD 在 MinIO 路径
 * @param {string} data.sourcePath - 源文件在 MinIO 路径
 * @param {boolean} data.elaborationEnabled - 是否开启文本细化
 * @returns {Promise<{ code: number, course?: Object, message?: string }>}
 */
async function createCourse(data) {
  console.log("[book_repo][createCourse] 创建课程: " + data.name);

  try {
    const course = await prisma.course.create({
      data: {
        userId: BigInt(data.userId),
        name: data.name,
        description: data.description || null,
        textbookFilename: data.textbookFilename,
        textbookPath: data.textbookPath,
        sourcePath: data.sourcePath,
        elaborationEnabled: data.elaborationEnabled !== undefined ? data.elaborationEnabled : true,
        pipelineStatus: "processing", // 初始状态为处理中（正在格式归一化）
      },
    });

    console.log("[book_repo][createCourse] 课程创建成功，ID: " + course.id);
    return { code: 200, course: course };
  } catch (error) {
    console.error("[book_repo][createCourse] 数据库创建异常: " + error.message);
    return { code: 500, message: "课程创建异常: " + error.message };
  }
}

/**
 * 按 ID 查询课程（含章节列表）
 * @param {string|number} id - 课程 ID
 * @returns {Promise<{ code: number, course?: Object, message?: string }>}
 */
async function getCourseById(id) {
  console.log("[book_repo][getCourseById] 查询课程ID: " + id);

  try {
    const course = await prisma.course.findUnique({
      where: {
        id: BigInt(id),
        isDeleted: false,
      },
      include: {
        chapters: {
          where: { isDeleted: false }, // 只返回未删除的章节
          orderBy: { sequence: "asc" }, // 按序号升序
        },
      },
    });

    if (!course) {
      console.log("[book_repo][getCourseById] 课程不存在，ID: " + id);
      return { code: 404, message: "课程不存在。" };
    }

    console.log("[book_repo][getCourseById] 课程查询成功，ID: " + course.id + "，章节数: " + course.chapters.length);
    return { code: 200, course: course };
  } catch (error) {
    console.error("[book_repo][getCourseById] 数据库查询异常: " + error.message);
    return { code: 500, message: "数据库查询异常: " + error.message };
  }
}

/**
 * 分页查询用户课程列表
 * @param {string|number} userId - 用户 ID
 * @param {number} page - 页码（从 1 开始）
 * @param {number} pageSize - 每页条数（最大 50）
 * @param {string} keyword - 搜索关键词（匹配 name）
 * @returns {Promise<{ code: number, data?: Object, message?: string }>}
 */
async function listCoursesByUser(userId, page, pageSize, keyword) {
  console.log("[book_repo][listCoursesByUser] 查询用户 " + userId + " 的课程列表，第 " + page + " 页，每页 " + pageSize + " 条");

  try {
    const skip = (page - 1) * pageSize; // 计算跳过的记录数

    // 构建查询条件：用户 + 未删除
    const where = {
      userId: BigInt(userId),
      isDeleted: false,
    };

    // 如果有关键词，添加模糊搜索
    if (keyword) {
      where.name = { contains: keyword };
    }

    // 并行查询：列表 + 总数
    const [items, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createTime: "desc" }, // 按创建时间倒序
        include: {
          chapters: {
            where: { isDeleted: false },
            orderBy: { sequence: "asc" },
          },
        },
      }),
      prisma.course.count({ where }),
    ]);

    console.log("[book_repo][listCoursesByUser] 查询完成，共 " + total + " 条，本页 " + items.length + " 条");
    return {
      code: 200,
      data: { items, total, page, pageSize },
    };
  } catch (error) {
    console.error("[book_repo][listCoursesByUser] 数据库查询异常: " + error.message);
    return { code: 500, message: "数据库查询异常: " + error.message };
  }
}

/**
 * 更新课程信息（通用）
 * @param {string|number} id - 课程 ID
 * @param {Object} data - 要更新的字段
 * @returns {Promise<{ code: number, course?: Object, message?: string }>}
 */
async function updateCourse(id, data) {
  console.log("[book_repo][updateCourse] 更新课程 " + id + "，字段: " + Object.keys(data).join(", "));

  try {
    const course = await prisma.course.update({
      where: { id: BigInt(id), isDeleted: false },
      data,
    });

    console.log("[book_repo][updateCourse] 课程更新成功，ID: " + course.id);
    return { code: 200, course: course };
  } catch (error) {
    if (error.code === "P2025") {
      console.log("[book_repo][updateCourse] 课程不存在，ID: " + id);
      return { code: 404, message: "课程不存在。" };
    }
    console.error("[book_repo][updateCourse] 数据库更新异常: " + error.message);
    return { code: 500, message: "数据库更新异常: " + error.message };
  }
}

/**
 * 更新已处理行号（流水线专用）
 * @param {string|number} id - 课程 ID
 * @param {number} endline - 新的 endline 值
 * @returns {Promise<{ code: number, message?: string }>}
 */
async function updateEndline(id, endline) {
  console.log("[book_repo][updateEndline] 课程 " + id + " 更新 endline → " + endline);

  try {
    await prisma.course.update({
      where: { id: BigInt(id), isDeleted: false },
      data: { endline: endline },
    });

    console.log("[book_repo][updateEndline] endline 更新成功");
    return { code: 200 };
  } catch (error) {
    if (error.code === "P2025") {
      return { code: 404, message: "课程不存在。" };
    }
    console.error("[book_repo][updateEndline] 数据库更新异常: " + error.message);
    return { code: 500, message: "数据库更新异常: " + error.message };
  }
}

/**
 * 更新流水线状态（流水线专用）
 * @param {string|number} id - 课程 ID
 * @param {string} status - 新的流水线状态
 * @returns {Promise<{ code: number, message?: string }>}
 */
async function updatePipelineStatus(id, status) {
  console.log("[book_repo][updatePipelineStatus] 课程 " + id + " 更新 pipelineStatus → " + status);

  try {
    await prisma.course.update({
      where: { id: BigInt(id), isDeleted: false },
      data: { pipelineStatus: status },
    });

    console.log("[book_repo][updatePipelineStatus] 状态更新成功");
    return { code: 200 };
  } catch (error) {
    if (error.code === "P2025") {
      return { code: 404, message: "课程不存在。" };
    }
    console.error("[book_repo][updatePipelineStatus] 数据库更新异常: " + error.message);
    return { code: 500, message: "数据库更新异常: " + error.message };
  }
}

/**
 * 软删除课程
 * @param {string|number} id - 课程 ID
 * @returns {Promise<{ code: number, message?: string }>}
 */
async function softDeleteCourse(id) {
  console.log("[book_repo][softDeleteCourse] 软删除课程: " + id);

  try {
    await prisma.course.update({
      where: { id: BigInt(id) },
      data: { isDeleted: true },
    });

    console.log("[book_repo][softDeleteCourse] 软删除成功");
    return { code: 200 };
  } catch (error) {
    if (error.code === "P2025") {
      return { code: 404, message: "课程不存在。" };
    }
    console.error("[book_repo][softDeleteCourse] 数据库更新异常: " + error.message);
    return { code: 500, message: "数据库更新异常: " + error.message };
  }
}

// 导出模块函数
module.exports = {
  createCourse,
  getCourseById,
  listCoursesByUser,
  updateCourse,
  updateEndline,
  updatePipelineStatus,
  softDeleteCourse,
};
