// ==================== 章节 Repository 模块 ====================
// 职责：封装对 Chapter 表的数据库操作，提供统一的数据访问接口
// 所有查询默认过滤 isDeleted: false，确保软删除记录不被检索
// 使用 Prisma Client 进行类型安全的数据库操作

// 引入 Prisma 单例实例
const prisma = require("../prisma");

// ==================== 导出函数 ====================

/**
 * 创建章节记录
 * @param {Object} data - 章节数据
 * @param {string|number} data.courseId - 课程 ID
 * @param {number} data.sequence - 章节序号
 * @param {string} data.name - 章节名称
 * @param {string} data.chapterRoot - MinIO 章节根目录
 * @param {number} data.startline - 起始行号
 * @param {number} data.endline - 结束行号
 * @returns {Promise<{ code: number, chapter?: Object, message?: string }>}
 */
async function createChapter(data) {
  console.log("[chapter_repo][createChapter] 创建章节: " + data.name + "（课程 " + data.courseId + "，序号 " + data.sequence + "）");

  try {
    const chapter = await prisma.chapter.create({
      data: {
        courseId: BigInt(data.courseId),
        sequence: data.sequence,
        name: data.name,
        description: data.description || null,
        chapterRoot: data.chapterRoot,
        startline: data.startline,
        endline: data.endline,
        status: "pending", // 初始状态为待处理
      },
    });

    console.log("[chapter_repo][createChapter] 章节创建成功，ID: " + chapter.id);
    return { code: 200, chapter: chapter };
  } catch (error) {
    console.error("[chapter_repo][createChapter] 数据库创建异常: " + error.message);
    return { code: 500, message: "章节创建异常: " + error.message };
  }
}

/**
 * 按 ID 查询章节
 * @param {string|number} id - 章节 ID
 * @returns {Promise<{ code: number, chapter?: Object, message?: string }>}
 */
async function getChapterById(id) {
  console.log("[chapter_repo][getChapterById] 查询章节ID: " + id);

  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: BigInt(id), isDeleted: false },
      include: { course: true }, // 包含课程信息
    });

    if (!chapter) {
      console.log("[chapter_repo][getChapterById] 章节不存在，ID: " + id);
      return { code: 404, message: "章节不存在。" };
    }

    console.log("[chapter_repo][getChapterById] 章节查询成功: " + chapter.name);
    return { code: 200, chapter: chapter };
  } catch (error) {
    console.error("[chapter_repo][getChapterById] 数据库查询异常: " + error.message);
    return { code: 500, message: "数据库查询异常: " + error.message };
  }
}

/**
 * 查询课程下所有章节（按序号升序）
 * @param {string|number} courseId - 课程 ID
 * @returns {Promise<{ code: number, chapters?: Array, message?: string }>}
 */
async function listChaptersByCourse(courseId) {
  console.log("[chapter_repo][listChaptersByCourse] 查询课程 " + courseId + " 的所有章节");

  try {
    const chapters = await prisma.chapter.findMany({
      where: {
        courseId: BigInt(courseId),
        isDeleted: false,
      },
      orderBy: { sequence: "asc" }, // 按序号升序排列
    });

    console.log("[chapter_repo][listChaptersByCourse] 查询完成，共 " + chapters.length + " 个章节");
    return { code: 200, chapters: chapters };
  } catch (error) {
    console.error("[chapter_repo][listChaptersByCourse] 数据库查询异常: " + error.message);
    return { code: 500, message: "数据库查询异常: " + error.message };
  }
}

/**
 * 更新章节信息（通用）
 * @param {string|number} id - 章节 ID
 * @param {Object} data - 要更新的字段（name, description, status, startline, endline 等）
 * @returns {Promise<{ code: number, chapter?: Object, message?: string }>}
 */
async function updateChapter(id, data) {
  console.log("[chapter_repo][updateChapter] 更新章节 " + id + "，字段: " + Object.keys(data).join(", "));

  try {
    const chapter = await prisma.chapter.update({
      where: { id: BigInt(id), isDeleted: false },
      data,
    });

    console.log("[chapter_repo][updateChapter] 章节更新成功，ID: " + chapter.id);
    return { code: 200, chapter: chapter };
  } catch (error) {
    if (error.code === "P2025") {
      console.log("[chapter_repo][updateChapter] 章节不存在，ID: " + id);
      return { code: 404, message: "章节不存在。" };
    }
    console.error("[chapter_repo][updateChapter] 数据库更新异常: " + error.message);
    return { code: 500, message: "数据库更新异常: " + error.message };
  }
}

/**
 * 更新章节总页数和大纲路径（流水线 Phase 3 专用）
 * @param {string|number} id - 章节 ID
 * @param {number} totalPages - PPT 总页数
 * @param {string} outlinePath - 大纲 JSON 的 MinIO 路径
 * @returns {Promise<{ code: number, message?: string }>}
 */
async function updateChapterTotalPages(id, totalPages, outlinePath) {
  console.log("[chapter_repo][updateChapterTotalPages] 章节 " + id + " 更新 totalPages=" + totalPages + ", outlinePath=" + outlinePath);

  try {
    await prisma.chapter.update({
      where: { id: BigInt(id), isDeleted: false },
      data: {
        totalPages: totalPages,
        outlinePath: outlinePath,
      },
    });

    console.log("[chapter_repo][updateChapterTotalPages] 更新成功");
    return { code: 200 };
  } catch (error) {
    if (error.code === "P2025") {
      return { code: 404, message: "章节不存在。" };
    }
    console.error("[chapter_repo][updateChapterTotalPages] 数据库更新异常: " + error.message);
    return { code: 500, message: "数据库更新异常: " + error.message };
  }
}

/**
 * 软删除章节
 * @param {string|number} id - 章节 ID
 * @returns {Promise<{ code: number, message?: string }>}
 */
async function softDeleteChapter(id) {
  console.log("[chapter_repo][softDeleteChapter] 软删除章节: " + id);

  try {
    await prisma.chapter.update({
      where: { id: BigInt(id) },
      data: { isDeleted: true },
    });

    console.log("[chapter_repo][softDeleteChapter] 软删除成功");
    return { code: 200 };
  } catch (error) {
    if (error.code === "P2025") {
      return { code: 404, message: "章节不存在。" };
    }
    console.error("[chapter_repo][softDeleteChapter] 数据库更新异常: " + error.message);
    return { code: 500, message: "数据库更新异常: " + error.message };
  }
}

// 导出模块函数
module.exports = {
  createChapter,
  getChapterById,
  listChaptersByCourse,
  updateChapter,
  updateChapterTotalPages,
  softDeleteChapter,
};
