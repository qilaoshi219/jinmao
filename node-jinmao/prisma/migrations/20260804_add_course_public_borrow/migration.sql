-- Course 表新增 is_public 字段：是否发布为公开课（广场可借阅）
ALTER TABLE `Course`
  ADD COLUMN `is_public` BOOLEAN NOT NULL DEFAULT false;

-- 创建公开课借用表 CourseBorrow
CREATE TABLE IF NOT EXISTS `CourseBorrow` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `course_id` BIGINT UNSIGNED NOT NULL,
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `CourseBorrow_userId_courseId_key`(`user_id`, `course_id`),
    INDEX `CourseBorrow_course_id_fkey`(`course_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CourseBorrow` ADD CONSTRAINT `CourseBorrow_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CourseBorrow` ADD CONSTRAINT `CourseBorrow_course_id_fkey`
    FOREIGN KEY (`course_id`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
