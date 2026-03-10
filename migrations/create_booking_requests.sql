-- Migration: Create Booking Request Tables
-- Date: 2026-02-06
-- Description: Creates tables for booking request system with pending approval workflow

-- Create booking_requests table
CREATE TABLE IF NOT EXISTS `booking_requests` (
  `request_id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `branch_id` INT(11) DEFAULT NULL,
  `booking_date` DATETIME DEFAULT NULL,
  `customer_id` INT(11) DEFAULT NULL,
  `customer_vehicle_id` INT(11) DEFAULT NULL,
  `latest_service` VARCHAR(255) DEFAULT NULL,
  `referred_by` INT(11) DEFAULT NULL,
  `service_order` VARCHAR(255) DEFAULT NULL,
  `notes` LONGTEXT DEFAULT NULL,
  `status` ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  `created_by` INT(11) DEFAULT NULL,
  `approved_by` INT(11) DEFAULT NULL,
  `approved_at` DATETIME DEFAULT NULL,
  `rejection_reason` TEXT DEFAULT NULL,
  `time_added` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `time_updated` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_customer` (`customer_id`),
  KEY `idx_status` (`status`),
  KEY `idx_booking_date` (`booking_date`),
  KEY `idx_branch` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create booking_request_services table
CREATE TABLE IF NOT EXISTS `booking_request_services` (
  `service_id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `request_id` INT(11) NOT NULL,
  `service_name` VARCHAR(255) NOT NULL,
  `price` VARCHAR(255) DEFAULT NULL,
  KEY `idx_request` (`request_id`),
  FOREIGN KEY (`request_id`) REFERENCES `booking_requests`(`request_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create booking_request_packages table
CREATE TABLE IF NOT EXISTS `booking_request_packages` (
  `package_id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `service_id` INT(11) NOT NULL,
  `package_name` VARCHAR(255) DEFAULT NULL,
  KEY `idx_service` (`service_id`),
  FOREIGN KEY (`service_id`) REFERENCES `booking_request_services`(`service_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert initial test data (optional)
-- This can be commented out if not needed
/*
INSERT INTO booking_requests (branch_id, booking_date, customer_id, customer_vehicle_id, status, notes)
VALUES (1, '2026-02-10 08:00:00', 1, 1, 'pending', 'Test booking request');
*/
