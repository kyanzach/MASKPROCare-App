-- Branch Booking Capacity Table
-- Stores per-branch, per-service booking capacity limits

CREATE TABLE IF NOT EXISTS branch_booking_capacity (
    id INT(11) AUTO_INCREMENT PRIMARY KEY,
    branch_id INT(11) NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    max_capacity INT(11) NOT NULL DEFAULT 4,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_branch_service (branch_id, service_name),
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default capacity for all existing branches
INSERT IGNORE INTO branch_booking_capacity (branch_id, service_name, max_capacity)
SELECT b.id, s.service_name, s.default_capacity
FROM branches b
CROSS JOIN (
    SELECT 'Nano Ceramic Coating' AS service_name, 4 AS default_capacity
    UNION ALL SELECT 'Nano Ceramic Tint', 4
    UNION ALL SELECT 'Nano Fix (Maintenance)', 5
    UNION ALL SELECT 'Go & Clean', 2
    UNION ALL SELECT 'PPF', 1
    UNION ALL SELECT 'Auto Paint & Repair', 1
) s;
