-- Mercedes Studio (26 Sep 2026): this repo is a full-history copy of Sheila Studio, and
-- 0001_init.sql seeded the media kit's public link name as 'sheila' (never edit a migration
-- that has run). Move that seed to the new owner's link name; an old link keeps forwarding.
UPDATE media_kit SET public_slug = 'mercedes' WHERE id = 1 AND public_slug = 'sheila';
UPDATE media_kit_versions SET slug = 'mercedes' WHERE slug = 'sheila';
DELETE FROM kit_slugs WHERE slug = 'sheila';
INSERT OR IGNORE INTO kit_slugs (slug) SELECT public_slug FROM media_kit WHERE id = 1;
