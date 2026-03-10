-- v1.3.0 Migration: Rename registration_expiry → registration_date + Create notifications table
-- Run: mysql -u root unify_maskpro < migrations/v1.3.0_notifications.sql

-- 1. Rename column (MySQL 8.0+)
ALTER TABLE vehicles CHANGE COLUMN registration_expiry registration_date DATE DEFAULT NULL;

-- 2. Create notifications table
CREATE TABLE IF NOT EXISTS customer_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  type VARCHAR(50) NOT NULL COMMENT 'registration_renewal, booking_confirmed, booking_reminder, system',
  title VARCHAR(255) NOT NULL,
  message TEXT,
  is_read TINYINT(1) DEFAULT 0,
  link VARCHAR(255) DEFAULT NULL COMMENT 'Deep-link path e.g. /vehicles',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_read (customer_id, is_read),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
