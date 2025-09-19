-- Database migration script to add Auth0 fields
-- Run this on the production server

-- Check current schema
PRAGMA table_info(user);

-- Add missing columns (will fail silently if they already exist)
ALTER TABLE user ADD COLUMN full_name TEXT;
ALTER TABLE user ADD COLUMN auth0_user_id TEXT UNIQUE;
ALTER TABLE user ADD COLUMN auth_provider TEXT;

-- Verify the changes
PRAGMA table_info(user);
