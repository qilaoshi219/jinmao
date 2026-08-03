-- 公开考试（二维码考试）功能
-- 1. 新建公开考试表 PublicExam
CREATE TABLE IF NOT EXISTS `PublicExam` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `exam_id` BIGINT UNSIGNED NOT NULL,
    `token` VARCHAR(32) NOT NULL,
    `title` VARCHAR(100) NOT NULL,
    `question_ids` JSON NOT NULL,
    `shuffle` BOOLEAN NOT NULL DEFAULT false,
    `duration_minutes` INT NOT NULL DEFAULT 60,
    `essay_mode` VARCHAR(10) NOT NULL DEFAULT 'full',
    `essay_keywords` JSON NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'published',
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `PublicExam_token_key`(`token`),
    INDEX `PublicExam_user_id_fkey`(`user_id`),
    INDEX `PublicExam_exam_id_fkey`(`exam_id`),
    CONSTRAINT `PublicExam_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `PublicExam_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `QuizExam` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. QuizSession：user_id 改为可空 + 新增游客身份 / 公开考试 / 单场限时 / 结果快照字段
ALTER TABLE `QuizSession` MODIFY COLUMN `user_id` BIGINT UNSIGNED NULL;
ALTER TABLE `QuizSession` ADD COLUMN `anonymous_key` VARCHAR(64) NULL;
ALTER TABLE `QuizSession` ADD COLUMN `public_exam_id` BIGINT UNSIGNED NULL;
ALTER TABLE `QuizSession` ADD COLUMN `deadline_at` DATETIME(3) NULL;
ALTER TABLE `QuizSession` ADD COLUMN `score_total` DOUBLE NULL;
ALTER TABLE `QuizSession` ADD COLUMN `result_json` JSON NULL;
ALTER TABLE `QuizSession` ADD INDEX `QuizSession_public_exam_id_fkey`(`public_exam_id`);
ALTER TABLE `QuizSession` ADD CONSTRAINT `QuizSession_public_exam_id_fkey`
    FOREIGN KEY (`public_exam_id`) REFERENCES `PublicExam` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. QuizUserAnswer：user_id 改为可空 + 新增游客身份字段
ALTER TABLE `QuizUserAnswer` MODIFY COLUMN `user_id` BIGINT UNSIGNED NULL;
ALTER TABLE `QuizUserAnswer` ADD COLUMN `anonymous_key` VARCHAR(64) NULL;
