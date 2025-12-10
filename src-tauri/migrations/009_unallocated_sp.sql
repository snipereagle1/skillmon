-- Add unallocated_sp column to characters table
ALTER TABLE characters ADD COLUMN unallocated_sp INTEGER NOT NULL DEFAULT 0;

