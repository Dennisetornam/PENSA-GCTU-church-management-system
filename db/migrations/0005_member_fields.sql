-- Migration 0005 — Member fields: academic level + residence detail
-- (hostel name for residents / location for non-residents). Gathering type is
-- no longer collected at registration (admin picks it at check-in).

ALTER TABLE members ADD COLUMN level TEXT;
ALTER TABLE members ADD COLUMN residence_detail TEXT;
