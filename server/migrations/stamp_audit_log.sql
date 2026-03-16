-- MaskPro Care: Stamp Audit Log
-- Tracks cron-driven BoomerangMe stamp deductions for idempotency
-- Run on production: mysql -u unify_user -p unify_maskpro < this_file.sql

CREATE TABLE IF NOT EXISTS care_stamp_audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  vehicle_id INT NOT NULL,
  booking_id INT NOT NULL,
  card_serial VARCHAR(50) DEFAULT NULL,
  card_category ENUM('coating','ppf') NOT NULL,
  action ENUM('deducted','skipped','error') NOT NULL,
  stamps_deducted INT DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_booking (booking_id),
  INDEX idx_customer (customer_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
