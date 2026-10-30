-- Per-user interface language (NULL: follow the cookie or the browser) and the time of the last password change.
ALTER TABLE users ADD COLUMN locale VARCHAR(5) CHARACTER SET ascii NULL, ADD COLUMN password_changed_at DATETIME(3) NULL;
