-- Add is_omega column to characters table
ALTER TABLE characters ADD COLUMN is_omega BOOLEAN NOT NULL DEFAULT 1;
