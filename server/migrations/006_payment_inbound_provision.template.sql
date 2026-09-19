-- Run only by the managed-MySQL administrator after an approved restore rehearsal.
-- Do not put a real password into this file or source control.
CREATE DATABASE `sravx_payment_inbound`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Apply 006_payment_inbound_ledger.sql while connected to sravx_payment_inbound.

-- Replace the bracketed placeholder in the database console, never in this file.
CREATE USER 'sravx_payment_ingress'@'10.0.0.15' IDENTIFIED BY '[generate-a-unique-32-plus-character-secret]';
GRANT INSERT, UPDATE ON `sravx_payment_inbound`.`payment_inbound_events` TO 'sravx_payment_ingress'@'10.0.0.15';

-- The later consumer is intentionally a separate account and is not enabled by this migration.
-- It needs only the final, reviewed SELECT/UPDATE permissions required by its implementation.
