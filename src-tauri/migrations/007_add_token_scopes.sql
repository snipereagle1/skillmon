-- Add scopes column to tokens table
-- Stores JSON array of authorized scopes for the token
ALTER TABLE tokens ADD COLUMN scopes TEXT;

