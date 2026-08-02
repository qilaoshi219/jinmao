-- 为 QuizTextbook 表新增 is_shared 字段
-- 用于题库市场共享功能，标记题库是否公开可见

ALTER TABLE `QuizTextbook` ADD COLUMN `is_shared` BOOLEAN NOT NULL DEFAULT false;

-- 创建题库借用表 QuizBookBorrow（如果不存在）
-- 记录用户借用共享题库的多对多关系

CREATE TABLE IF NOT EXISTS `QuizBookBorrow` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `textbook_id` BIGINT UNSIGNED NOT NULL,
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `QuizBookBorrow_userId_textbookId_key`(`user_id`, `textbook_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
