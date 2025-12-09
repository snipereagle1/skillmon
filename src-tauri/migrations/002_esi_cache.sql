-- ESI response cache table
CREATE TABLE IF NOT EXISTS esi_cache (
  cache_key TEXT PRIMARY KEY,
  etag TEXT,
  expires_at INTEGER NOT NULL,
  response_body TEXT NOT NULL
);

-- Index for faster cache lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_esi_cache_expires_at ON esi_cache(expires_at);

