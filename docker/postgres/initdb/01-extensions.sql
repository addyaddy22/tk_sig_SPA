-- Runs once when the database volume is first created.
--
-- btree_gist lets PostgreSQL enforce "no overlapping bookings for the same therapist"
-- (EXCLUDE USING gist ("therapistId" WITH =, tstzrange(...) WITH &&)).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Also install it in template1 so every database created later has it too -
-- including the temporary shadow database used by `prisma migrate dev`.
\connect template1
CREATE EXTENSION IF NOT EXISTS btree_gist;
