-- Generic notification settings with JSON config for flexibility
CREATE TABLE IF NOT EXISTS notification_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  notification_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT, -- JSON blob for type-specific settings
  FOREIGN KEY (character_id) REFERENCES characters(character_id) ON DELETE CASCADE,
  UNIQUE(character_id, notification_type)
);

-- Notifications table for active/dismissed notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'dismissed'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (character_id) REFERENCES characters(character_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_character_status
  ON notifications(character_id, status);
CREATE INDEX IF NOT EXISTS idx_notification_settings_character
  ON notification_settings(character_id);


