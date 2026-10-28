-- Unique normalized site URL (SHA-256 of the normalized base URL) and the non-secret remote integration id.
ALTER TABLE sites ADD COLUMN url_hash CHAR(64) CHARACTER SET ascii NULL, ADD COLUMN integration_id BIGINT UNSIGNED NULL, ADD UNIQUE KEY sites_url_hash (url_hash);
