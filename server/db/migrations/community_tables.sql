-- Care Community Migration
-- Run this script to create the required tables for the MASKPRO S.O.S. / Care Community feature.

CREATE TABLE IF NOT EXISTS community_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  type ENUM('sos', 'discussion') NOT NULL DEFAULT 'discussion',
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  location VARCHAR(255) DEFAULT NULL,
  status ENUM('open', 'resolved', 'hidden') NOT NULL DEFAULT 'open',
  is_approved BOOLEAN NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  customer_id INT NOT NULL,
  is_tech BOOLEAN NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);
