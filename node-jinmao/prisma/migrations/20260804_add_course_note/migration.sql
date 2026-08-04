-- 创建课程笔记表 CourseNote
-- 记录用户在课程-章节-页码维度的笔记（含标记色）
CREATE TABLE IF NOT EXISTS `CourseNote` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `course_id` BIGINT UNSIGNED NOT NULL,
    `chapter_id` BIGINT UNSIGNED NOT NULL,
    `page_number` INT UNSIGNED NOT NULL DEFAULT 1,
    `color` VARCHAR(20) NOT NULL DEFAULT 'yellow',
    `content` TEXT NOT NULL,
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_time` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `CourseNote_user_id_course_id_idx`(`user_id`, `course_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CourseNote` ADD CONSTRAINT `CourseNote_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CourseNote` ADD CONSTRAINT `CourseNote_course_id_fkey`
    FOREIGN KEY (`course_id`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CourseNote` ADD CONSTRAINT `CourseNote_chapter_id_fkey`
    FOREIGN KEY (`chapter_id`) REFERENCES `Chapter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
