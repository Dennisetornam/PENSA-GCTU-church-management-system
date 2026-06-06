-- Migration 0005 — Residence detail (hostel name / non-resident location)
ALTER TABLE members ADD COLUMN residence_detail TEXT;
