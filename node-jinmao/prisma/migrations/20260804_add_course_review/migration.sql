-- 创建课程评价表 CourseReview
-- 同一用户同一课程仅一条评价（联合唯一）
CREATE TABLE IF NOT EXISTS `CourseReview` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `course_id` BIGINT UNSIGNED NOT NULL,
    `rating` INT UNSIGNED NOT NULL DEFAULT 5,
    `content` TEXT NOT NULL,
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_time` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `CourseReview_userId_courseId_key`(`user_id`, `course_id`),
    INDEX `CourseReview_course_id_fkey`(`course_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CourseReview` ADD CONSTRAINT `CourseReview_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CourseReview` ADD CONSTRAINT `CourseReview_course_id_fkey`
    FOREIGN KEY (`course_id`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
