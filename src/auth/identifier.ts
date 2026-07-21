import { z } from "zod";

// Login identifier for admin/leader accounts. Accepts a real email OR a
// username-style handle (this church uses dotted handles like
// "pensagctu.media.org", not @-addresses). Case-insensitive, no spaces.
export const loginIdentifier = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .transform((s) => s.toLowerCase())
  .refine((v) => /^[a-z0-9._@+-]+$/.test(v), { message: "use letters, digits and . _ - + @ only" });
