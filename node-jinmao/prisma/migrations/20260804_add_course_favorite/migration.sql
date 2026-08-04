-- 创建课程收藏表 CourseFavorite
-- 记录用户收藏的课程，联合唯一约束 (user_id, course_id)
CREATE TABLE IF NOT EXISTS `CourseFavorite` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `course_id` BIGINT UNSIGNED NOT NULL,
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `CourseFavorite_userId_courseId_key`(`user_id`, `course_id`),
    INDEX `CourseFavorite_course_id_fkey`(`course_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 添加外键约束
ALTER TABLE `CourseFavorite` ADD CONSTRAINT `CourseFavorite_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CourseFavorite` ADD CONSTRAINT `CourseFavorite_course_id_fkey`
    FOREIGN KEY (`course_id`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
