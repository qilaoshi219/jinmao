// ==================== MD→JSON 任务类型定义 ====================
// 职责：集中定义任务实体、题型配额、分段记录等数据结构的 JSDoc 类型
// 注意：本文件仅提供 JSDoc 类型注释，不导出可实例化的对象
// 移植自 test/金毛刷题/backend/src/modules/markdown-json-test/types.ts

/**
 * @typedef {'single'|'multiple'|'judge'|'fill'|'short_answer'} QuestionType
 *   题目类型：单选 / 多选 / 判断 / 填空 / 简答
 */

/**
 * @typedef {Object} GenerationConfig
 *   题型生成配额
 * @property {number} single       - 单选题数量
 * @property {number} multiple     - 多选题数量
 * @property {number} judge        - 判断题数量
 * @property {number} fill         - 填空题数量
 * @property {number} shortAnswer  - 简答题数量
 */

/**
 * @typedef {'pending'|'running'|'completed'|'failed'} TaskStatus
 *   任务状态
 */

/**
 * @typedef {'pending'|'importing'|'imported'|'failed'} ImportStatus
 *   导入状态
 */

/**
 * @typedef {Object} ChunkRange
 *   分块范围 + 该块生成的题型统计
 * @property {number} startLine              - 起始行号
 * @property {number} endLine                - 结束行号
 * @property {GenerationConfig} generatedCountByType - 本块生成的各题型数量
 */

/**
 * @typedef {Object} ChunkRecord
 *   分块记录
 * @property {number} index      - 分块序号（1-based）
 * @property {number} startLine  - 起始行号
 * @property {number} endLine    - 结束行号
 * @property {number} startChar  - 起始字符位置
 * @property {number} endChar    - 结束字符位置
 * @property {string} content    - 文本内容
 */

/**
 * @typedef {Object} QuestionRecord
 *   AI 生成的单道题目
 * @property {number} [id]         - 题目 ID（自动生成）
 * @property {QuestionType} type   - 题型
 * @property {string} question     - 题干
 * @property {string[]} [options]  - 选项数组（选择题）
 * @property {string|string[]|boolean} answer - 答案
 * @property {string} [explanation] - 解析
 */

/**
 * @typedef {Object} ImportResult
 *   导入结果
 * @property {string} textbookId   - 题库 ID
 * @property {string} examId       - 试卷 ID
 * @property {string} textbookName - 题库名称
 * @property {string} examName     - 试卷名称
 * @property {number} totalCount   - 总题数
 * @property {number} importedCount - 成功导入数
 * @property {number} failedCount  - 失败数
 */

/**
 * @typedef {Object} TaskEntity
 *   任务实体（核心数据结构）
 * @property {string} taskId                    - 任务 ID（UUID）
 * @property {string} ownerUserId               - 所属用户 ID
 * @property {TaskStatus} status                - 任务状态
 * @property {ImportStatus} importStatus        - 导入状态
 * @property {string} fileName                  - 源文件名
 * @property {string} textbookName              - 题库名称
 * @property {string} examName                  - 试卷名称
 * @property {string} description               - 题库描述
 * @property {string} textbookId                - 预创建的题库 ID
 * @property {string} examId                    - 预创建的试卷 ID
 * @property {number} totalLength               - 文本总长
 * @property {number} totalLineCount            - 总行数
 * @property {number} chunkCount                - 分块数
 * @property {number} completedChunkCount       - 已完成块数
 * @property {ChunkRange[]} chunkRanges         - 各块生成范围
 * @property {GenerationConfig} generationConfig - 题型配额
 * @property {GenerationConfig} [totalGeneratedCountByType] - 累计生成统计
 * @property {string} [errorMessage]            - 错误消息
 * @property {number} [currentChunkIndex]       - 当前块序号
 * @property {number} [currentAttempt]          - 当前尝试次数
 * @property {string} [currentPhase]            - 当前阶段标识
 * @property {string} [lastMessage]             - 最新状态消息
 * @property {number} streamedCharacterCount    - 已流式输出的字符数
 * @property {number} currentChunkStreamedCharacterCount - 当前块流式字符数
 * @property {ImportResult} [importResult]      - 导入结果
 * @property {Array<{timestamp: string, message: string}>} [recentEvents] - 最近事件
 * @property {string} [updatedAt]               - 更新时间
 */

/**
 * @typedef {Object} TaskProgress
 *   前端轮询用的进度数据（对齐 GET /book/:id/progress 风格）
 * @property {string} taskId
 * @property {string} textbookId
 * @property {TaskStatus} status
 * @property {boolean} isTerminal              - 是否为终端状态
 * @property {Object} progress
 * @property {string} progress.phase           - 当前阶段
 * @property {{current: number, total: number}} [progress.chunkProgress]   - 分块进度
 * @property {{current: number, total: number}} [progress.importProgress]  - 导入进度
 * @property {number} [progress.streamedCharacterCount] - 流式字符数
 * @property {ImportResult} [progress.importResult]     - 导入结果（终端状态时）
 */

/**
 * @typedef {Object} DeepseekMessage
 * @property {'system'|'user'|'assistant'} role
 * @property {string} content
 */

/**
 * @typedef {Object} ValidationSuccess
 * @property {true} success
 * @property {QuestionRecord[]} questions
 * @property {GenerationConfig} generatedCountByType
 */

/**
 * @typedef {Object} ValidationFailure
 * @property {false} success
 * @property {string} message
 */

/**
 * @typedef {ValidationSuccess|ValidationFailure} ValidationResult
 */

module.exports = {};
