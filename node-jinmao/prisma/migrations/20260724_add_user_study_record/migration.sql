-- CreateTable：创建用户学习记录表 UserStudyRecord
-- 记录每个用户在每个课程-章节的学习进度（页码）
-- 联合唯一约束：(user_id, course_id, chapter_id)，每个用户每课程每章节仅一条记录
CREATE TABLE `UserStudyRecord` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `course_id` BIGINT UNSIGNED NOT NULL,
    `chapter_id` BIGINT UNSIGNED NOT NULL,
    `progress` INT UNSIGNED NOT NULL DEFAULT 0,
    `study_duration` INT UNSIGNED NOT NULL DEFAULT 0,
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_time` DATETIME(3) NOT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 添加联合唯一约束：同一用户、同一课程、同一章节仅一条记录
CREATE UNIQUE INDEX `UserStudyRecord_user_id_course_id_chapter_id_key` ON `UserStudyRecord`(`user_id`, `course_id`, `chapter_id`);

-- 添加外键约束
ALTER TABLE `UserStudyRecord` ADD CONSTRAINT `UserStudyRecord_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UserStudyRecord` ADD CONSTRAINT `UserStudyRecord_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UserStudyRecord` ADD CONSTRAINT `UserStudyRecord_chapter_id_fkey` FOREIGN KEY (`chapter_id`) REFERENCES `Chapter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
