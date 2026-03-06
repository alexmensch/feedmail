-- Rename site_id to channel_id in subscribers table.
-- D1 runs SQLite 3.25.0+ which supports ALTER TABLE RENAME COLUMN.

ALTER TABLE subscribers RENAME COLUMN site_id TO channel_id;

-- Recreate indexes and unique constraint that referenced the old column name.
-- SQLite RENAME COLUMN updates the column name in constraints/indexes automatically,
-- but we rename the indexes themselves for clarity.

DROP INDEX IF EXISTS idx_subscribers_site_status;
CREATE INDEX idx_subscribers_channel_status ON subscribers(channel_id, status);
