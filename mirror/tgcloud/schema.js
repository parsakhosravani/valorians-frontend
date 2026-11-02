// The game creates its own tables on first use (src/server/db.ts runs
// CREATE TABLE IF NOT EXISTS through the database shim), exactly like on
// Vercel, so the mirror and the app can't drift apart. That means this file
// stays empty and `tgcloud migrate` will list those tables as "undocumented":
// that is expected — don't let it drop them.
export {};
