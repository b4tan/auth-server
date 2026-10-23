# auth-server

An authentication and authorization server in TypeScript and Express, written
from scratch as the login service for Bisa, a gig-work platform for Southeast
Asian SMEs. Users sign up, verify their email with a one-time code, and get a
short-lived access token plus a refresh session that rotates on every use.

## How it works

```
register ──► email OTP ──► verify-email ──► access token (15 min, RS256 JWT)
                                            refresh cookie (7 days, httpOnly)

refresh-token ──► old session swapped for a new one in a single update
logout        ──► session revoked
```

- **Access tokens** are RS256-signed JWTs carrying the user's id, role and
  scopes. Verification only accepts RS256.
- **Refresh tokens** are 64 random bytes in an httpOnly, SameSite=strict
  cookie. Only an HMAC-SHA256 of each token, keyed with a server-side pepper,
  is stored. Each refresh replaces the token in one conditional update, so a
  used token can't be used again.
- **Passwords** are hashed with Argon2id (64 MB, 3 iterations).
- **Email OTP**: six digits from a CSPRNG, stored hashed, compared in constant
  time, valid for 15 minutes, with a 30-minute lockout after 3 wrong tries.
- **CSRF**: double-submit cookie on every state-changing route.
- **Validation**: every request body is checked with Zod before it reaches a
  controller.
- **Roles**: worker, employer and admin, with a scope guard
  (`ScopeMiddleware.requireScope`) for routes that need specific permissions.

The code is layered as routes → controllers → services → repositories
(Prisma), wired together by hand in `src/container.ts`.

## API

| Method | Path                     | Notes                                   |
| ------ | ------------------------ | --------------------------------------- |
| GET    | `/api/auth/csrf-token`   | Sets the CSRF cookie and header         |
| POST   | `/api/auth/register`     | `{ email, password, phone }`, sends OTP |
| POST   | `/api/auth/verify-email` | `{ email, otp }`, returns tokens        |
| POST   | `/api/auth/resend-otp`   | `{ email }`                             |
| POST   | `/api/auth/login`        | `{ email, password }`                   |
| POST   | `/api/auth/refresh-token`| Rotates the refresh cookie              |
| POST   | `/api/auth/logout`       | Revokes the refresh session             |
| GET    | `/api/user/me`           | `Authorization: Bearer <access token>`  |
| GET    | `/health`                |                                         |

POST routes need the `X-CSRF-Token` header to match the `csrf-token` cookie.

## Running it

Needs Node 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL and SMTP
npm run keys                # RSA keypair + refresh pepper in src/keys (gitignored)
npm run prisma:migrate      # create the tables
npm run dev
```

## Tests

```bash
npm test
```

Unit, integration and end-to-end suites (Jest + Supertest). The database and
email are replaced with in-memory fakes, so no services are needed. The tests
that send real mail through Ethereal are skipped unless `RUN_ETHEREAL=1`.

## Not done yet

- Rate limiting on login and OTP (`src/middleware/ratelimit.middleware.ts` is a stub).
- Key rotation without logging everyone out (key IDs and a JWKS endpoint).
- Checking the `disabled` flag at login and refresh.
