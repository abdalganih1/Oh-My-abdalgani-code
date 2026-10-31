-- Internal accounts (the admin playground): hidden from the student list, skip device binding,
-- and may pin a request to one route with the X-Abd-Route header for provider testing.
ALTER TABLE users ADD COLUMN internal INTEGER NOT NULL DEFAULT 0;
