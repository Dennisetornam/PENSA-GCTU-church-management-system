-- Migration 0009 — store the R2 key of a Momo transaction reference screenshot.

ALTER TABLE finance_entries ADD COLUMN reference_image_key TEXT;
