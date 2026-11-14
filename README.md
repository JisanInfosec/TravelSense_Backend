# TravelSense API (NestJS)

See the [root README](../README.md) for setup, test accounts and architecture.

## Scripts

| Script | Purpose |
|---|---|
| `npm run start:dev` | Run with watch mode on `PORT` (default 4000) |
| `npm run build` / `npm run start:prod` | Production build / run |
| `npm run deploy` | Verify, migrate, sync production variables and deploy to Vercel |
| `npm run deploy -- --skip-migrations` | Deploy an environment-only change when migrations are already applied |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply existing migrations (CI/production) |
| `npm run db:seed` | Load demo data and test accounts (clears existing destinations/reviews) |
| `npm run db:reset` | Drop, re-migrate and re-seed the database |
| `npm test` / `npm run test:e2e` | Unit tests / API end-to-end tests (needs running API) |

## Vercel deployment

Set the Vercel project root directory to `TravelSense-Backend`. The included
`api/index.mjs` serverless entrypoint and `vercel.json` route requests to NestJS.
The API remains under the `/api` prefix, so verify a deployment with
`https://<deployment-domain>/api/health`.

Configure these production environment variables in Vercel:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGINS` (comma-separated exact origins or scoped patterns such as
  `https://travel-sense-site-*.vercel.app`)
- `JWT_EXPIRES_IN` (optional)
- `FRONTEND_URL` (used to build password-reset links)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and
  `MAIL_FROM` (Nodemailer email delivery)
- `EMAIL_VERIFICATION_OTP_EXPIRES_MINUTES`, `EMAIL_RESEND_COOLDOWN_SECONDS`,
  and `PASSWORD_RESET_EXPIRES_MINUTES` (optional)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` (optional)

## Endpoints (prefix `/api`)

| Method & path | Access |
|---|---|
| `POST /auth/register`, `POST /auth/verify-email`, `POST /auth/resend-verification` | Public |
| `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/logout` | Public |
| `GET /auth/me`, `PATCH /users/me`, `PATCH /users/me/password` | Logged in |
| `GET /destinations?q=&category=&featured=&hiddenGem=&sort=&page=&limit=` | Public |
| `GET /destinations/categories`, `GET /destinations/:slug`, `GET /destinations/:id/reviews` | Public |
| `POST /destinations/:id/reviews`, `GET /reviews/mine`, `PATCH /reviews/:id`, `DELETE /reviews/:id` | Tourist |
| `GET/PUT/DELETE /me/favorites[/:destinationId]` | Tourist |
| `GET/PUT/PATCH/DELETE /me/wishlist[/:destinationId]` | Tourist |
| `GET /moderation/reviews?status=&q=`, `GET /moderation/reviews/summary`, `PATCH /moderation/reviews/:id` | Moderator, Admin |
| `GET/POST/PUT/DELETE /admin/destinations[/:id]` | Admin |
| `GET /admin/users`, `POST /admin/users`, `DELETE /admin/users/:id`, `GET /admin/reports` | Admin |
| `GET /admin/uploads/config`, `POST /admin/uploads` (multipart `file`) | Admin |
| `GET /health` | Public |

## Layout

```
src/
  auth/ email/ users/ destinations/ reviews/ saved/ admin/ uploads/   feature modules
  common/       guards (JWT, roles), decorators, DTO helpers, utils
  prisma/       PrismaService (pg driver adapter)
  generated/    Prisma client (generated, git-ignored)
prisma/
  schema.prisma, migrations/, seed.ts, seed-data/
test/api.e2e-spec.ts
```
