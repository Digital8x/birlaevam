-- Birla Evam Lead Management Database Schema
-- 
-- PREREQUISITES:
-- The target database must already exist and be selected before running this script.
-- This script does not create or switch databases (to support cPanel shared hosting 
-- and strict permission environments).
-- 
-- For CLI usage, provide the database name as a parameter:
--   mysql -u username -p database_name < schema.sql
-- 
-- For CI/CD or IaC pipelines, ensure the database is provisioned and selected 
-- (e.g., via a prior `USE database_name;` statement) before applying this schema.


-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(150) DEFAULT '',
  ip_address VARCHAR(50) DEFAULT '',
  device VARCHAR(50) DEFAULT '',
  browser VARCHAR(50) DEFAULT '',
  refer_url VARCHAR(500) DEFAULT '',
  city VARCHAR(100) DEFAULT '',
  country VARCHAR(100) DEFAULT '',
  project VARCHAR(100) DEFAULT 'Birla Evam',
  source_button VARCHAR(100) DEFAULT 'General Enquiry',
  utm_source VARCHAR(100) DEFAULT '',
  utm_medium VARCHAR(100) DEFAULT '',
  is_deleted TINYINT(1) DEFAULT 0,
  submitted_at VARCHAR(30) NOT NULL
);

-- Dynamic Admin Settings for SMTP and email notifications
CREATE TABLE IF NOT EXISTS settings (
  key_name VARCHAR(50) PRIMARY KEY,
  key_value TEXT NOT NULL
);

-- Pre-seed some default settings if needed, but the server will handle it
