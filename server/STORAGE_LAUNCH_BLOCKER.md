
# BEFORE LAUNCH — migrate document storage to Cloudinary (or S3 / persistent object store)

Why: uploads currently land on the server's local disk via multer
(see `server/config/storage.js` → `server/uploads/`, served by `GET /uploads/:filename` in `server.js`).
Render, Railway, Vercel, Fly, and most PaaS hosts use ephemeral filesystems:
every redeploy / restart / scale event **WIPES that directory and all student documents with it**.

Migration checklist when ready:

1. `npm i cloudinary multer-storage-cloudinary` (or `@aws-sdk/client-s3` + `multer-s3`)
2. Rewrite `server/config/storage.js` to use the cloud engine; keep the same
   field name (`"file"`), 5MB image-only validation, and safe filename rules.
3. Update `client/src/lib/docUrl.ts` to return the cloud URL (`Document.path` / `secure_url`)
   instead of `` `${SERVER_BASE}/uploads/<filename>` ``.
4. Re-upload / backfill existing local files, or accept their loss on first deploy.

Until then, local disk is fine for development only.
