-- Draft only. Apply after the target-schema comparison and restore rehearsal.
-- This migration must not be run against production without owner approval.
ALTER TABLE `users`
  ADD COLUMN `profile_updated_at` DATETIME NULL COMMENT '资料最近修改时间' AFTER `updated_at`;
