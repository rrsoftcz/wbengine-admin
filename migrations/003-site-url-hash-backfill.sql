-- Existing rows already store the normalized URL (lower-case host, trailing slash).
UPDATE sites SET url_hash=SHA2(base_url,256) WHERE url_hash IS NULL;
