# TK Signature Spa: Booking Website & Management System

A full online booking system for a spa, beauty, and wellness business. Clients book treatments online. Staff manage the day from a live schedule. **The system guarantees that no therapist and no client can ever be double-booked.**

The whole codebase is **TypeScript** (strict mode): API, database seed, test scripts and frontend.

| Layer    | Tech                                                        |
| -------- | ----------------------------------------------------------- |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 + TanStack Query |
| Backend  | NestJS 11 (REST, `/api`)                                     |
| Database | PostgreSQL 16                                                |
| ORM      | Prisma 6                                                     |
| Auth     | Custom JWT (bcrypt password hashing, role-based guards)      |

---

## Booking rules (enforced by the server)

Preventing collisions is a **core business rule of the booking engine**, not something the UI handles.
The frontend only displays what the API allows. Every create or reschedule request, whether it comes from the
website, the front desk, Swagger, or a script, is re-validated on the server against:

| Rule | A therapist can take the booking only if… |
| ---- | ----------------------------------------- |
| **Skills** | they offer the service and are active (`NOT_QUALIFIED`, `THERAPIST_INACTIVE`) |
| **Service duration** | the whole treatment (e.g. 90 min) fits inside one of their shifts |
| **Working hours & daily breaks** | it fits within their weekly shifts. A gap between shifts (e.g. 13:00–14:00 lunch) is a break (`OUTSIDE_WORKING_HOURS`) |
| **Leave / time off** | it does not touch any time off (`TIME_OFF`) |
| **Existing appointments** | treatment + cleanup buffer does not overlap any of their active bookings (`ALREADY_BOOKED`) |
| **Client** | the client has no other treatment at that time (`CLIENT_OVERLAP`) |

The same rule function (`checkSlot` in `slot-engine.ts`) is used both to **calculate availability** and to
**validate the booking**, so what clients see and what the server accepts can never disagree.

### Two ways to book
1. **Therapist first:** the client picks a therapist, and the calendar shows only the times that therapist is free
   (`GET /availability?serviceId&date&therapistId`). If that day is full, the response includes
   `nextAvailable` so the UI can jump straight to the therapist's next free day.
2. **Time first:** the client picks a time from every slot where at least one qualified therapist is free
   (`GET /availability?serviceId&date`). Then `GET /availability/at-time?serviceId&startAt` lists every therapist
   who offers the service, whether they are free for the **entire required period** (treatment + cleanup),
   and the reason if not. The client picks a therapist or "no preference" (the least-busy free therapist is assigned).


Each request passes through three independent layers:

1. **Smart availability engine** (`backend/src/availability/slot-engine.ts`)
   Clients are only shown times where a therapist:
   - offers that treatment,
   - is **working** (weekly shifts, split shifts supported, e.g. a lunch gap),
   - is **not on time off** (leave, training, breaks),
   - has **no overlapping booking**, including the **cleanup buffer** after each treatment
     (e.g. a 60 min massage + 15 min cleanup blocks the therapist for 75 min).

   For each time slot the engine returns **which therapists are free**. Clients can choose
   "Any available therapist" and see who is free at each time.

2. **Serialized, re-validated writes** (`backend/src/common/schedule-lock.ts`)
   Each create or reschedule, and each change to leave, working hours or skills, runs inside a
   database transaction that first takes the same PostgreSQL advisory lock. So a booking and new leave for the same
   slot can never both succeed. It then re-checks everything against the latest data. Two clients
   clicking the same slot at the same moment are processed one after the other: the first
   gets the slot, and the second gets a clear message plus alternatives.

3. **Database exclusion constraints** (`backend/prisma/migrations/.../migration.sql`)
   PostgreSQL itself rejects overlapping active bookings, even if a bug or a manual SQL
   edit tried to insert one:
   ```sql
   EXCLUDE USING gist ("therapistId" WITH =, tstzrange("startAt", "blockedUntil") WITH &&)
     WHERE (status IN ('PENDING','CONFIRMED'))
   ```
   A second constraint stops the **same client** from having two overlapping treatments.

### When a requested time isn't possible
The API responds `409 Conflict` with a clear reason and alternatives:
```json
{
  "code": "ALREADY_BOOKED",
  "message": "Grace Chikwanha is already booked at that time.",
  "alternatives": {
    "freeTherapistsAtRequestedTime": [{ "id": "…", "name": "Rudo Ncube" }],
    "nearestSlots": [{ "start": "2026-10-01T09:15:00.000Z", "therapistIds": ["…"] }]
  }
}
```
Other reasons include `OUTSIDE_WORKING_HOURS`, `TIME_OFF`, `NO_THERAPIST_AVAILABLE`, `CLIENT_OVERLAP`, and `SLOT_TAKEN`.
The UI shows these as one-click buttons ("Book Rudo at 10:00 instead", "10:45", …).

With **"Any therapist"**, the system auto-assigns the free therapist with the fewest bookings that day, which spreads work evenly.

---

## Features

**Clients**
- Browse the treatment menu (grouped by category, with price and duration)
- Book **therapist first** (calendar shows only that therapist's free times, with a "next available" jump) or
  **time first** (pick a time, then see which qualified therapists are free, and why the others aren't)
- Their selection survives sign-in and registration
- My bookings: upcoming and history, **reschedule** (same protections), **cancel**

**Front desk / Admin**
- Day schedule: one column per therapist, working hours shaded, bookings plus cleanup time
- Create bookings for phone or walk-in clients (matched by email, or created automatically)
- Mark bookings completed, no-show, or cancelled; cancelling frees the slot immediately
- Manage therapists: profile, treatments they offer, weekly shifts, time off
  - Adding time off over existing bookings is flagged, with a list of affected clients
  - Changing hours warns about upcoming bookings now outside the new hours
- Manage services: duration, cleanup buffer, price, active/inactive

**Therapists** (staff login): see their own schedule and update booking status.

---

## Getting started

### Prerequisites
- Node.js 20+ (tested on Node 24)
- Docker (recommended), to run PostgreSQL in a container. Or your own PostgreSQL 14+ with the `btree_gist` extension.

### 1. Database (PostgreSQL in Docker)
The image is defined in `docker/postgres/Dockerfile`: the official PostgreSQL 16 image plus an init script
that enables `btree_gist`, which the no-double-booking constraints need.

```bash
docker compose up -d --build db      # build the image and start the container (or: npm run db:up)
docker compose ps                    # wait for STATUS "healthy"
```
It listens on `localhost:5432` with user `spa`, password `spa_password`, database `tk_sig_spa`. That matches the default
`DATABASE_URL` in `backend/.env.example`. Data lives in the named volume `tk_sig_spa_pgdata`, so it survives restarts.
To change the credentials or port, copy `.env.example` to `.env` in the project root and update `DATABASE_URL` to match.

| Command (project root) | What it does |
| ---------------------- | ------------ |
| `npm run db:up`        | Build and start the container |
| `npm run db:down`      | Stop it (data is kept) |
| `npm run db:logs`      | Follow the PostgreSQL logs |
| `npm run db:psql`      | Open a `psql` shell inside the container |
| `npm run db:reset`     | **Delete all data** and start fresh (then re-run migrate + seed) |

Without Compose:
```bash
docker build -t tk-sig-spa-postgres ./docker/postgres
docker run -d --name tk_sig_spa_db -p 5432:5432 -e POSTGRES_PASSWORD=spa_password \
  -v tk_sig_spa_pgdata:/var/lib/postgresql/data tk-sig-spa-postgres
```

### 2. Backend
```bash
cd backend
cp .env.example .env           # adjust DATABASE_URL, JWT_SECRET, SPA_TIMEZONE…
npm install
npx prisma migrate deploy      # creates tables + exclusion constraints
npm run db:seed                # demo services, therapists, logins
npm run start:dev              # http://localhost:3000/api
                               # API docs / tester: http://localhost:3000/api/docs
npm run typecheck              # strict TypeScript check of src/, prisma/ and scripts/
npm test                       # scheduling engine unit tests
npm run test:race              # with the API running: fires 12 simultaneous bookings
                               # at one slot and proves only one succeeds
npm run test:rules             # with the API running: checks every booking rule via the API
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                    # http://localhost:5173 (proxies /api → :3000)
```

### Demo logins (password `Password123!`)
| Role      | Email                 |
| --------- | --------------------- |
| Admin     | admin@tksigspa.com    |
| Client    | client@example.com    |
| Therapist | grace@tksigspa.com (also rudo@, nyasha@, chipo@) |

---

## Configuration (`backend/.env`)

| Variable               | Default            | Meaning                                         |
| ---------------------- | ------------------ | ----------------------------------------------- |
| `SPA_TIMEZONE`         | `Africa/Harare`    | All working hours and displayed times use this  |
| `SLOT_STEP_MIN`        | `15`               | Bookings start on multiples of this             |
| `MIN_LEAD_MIN`         | `60`               | Clients must book at least this far ahead       |
| `BOOKING_HORIZON_DAYS` | `60`               | How far ahead clients can book                  |
| `CURRENCY`             | `USD`              | Display currency                                |
| `JWT_SECRET`           | —                  | **Set a long random value in production**       |
| `SWAGGER_ENABLED`      | `true`             | Serve Swagger UI at `/api/docs`                  |
| `CORS_ORIGIN`          | `http://localhost:5173` | Comma-separated allowed frontend origins   |

---

## API overview (`/api`)

**Interactive docs (Swagger UI): http://localhost:3000/api/docs.** You can try every endpoint from the browser:
1. Open `POST /api/auth/login` → **Try it out** → **Execute**. The demo admin login is pre-filled.
2. Copy `accessToken` from the response, click **Authorize** (top right), paste it, and confirm.
3. Call any endpoint. The token is remembered across page reloads.

The raw OpenAPI spec is at `/api/docs-json` (you can import it into Postman or Insomnia). Set `SWAGGER_ENABLED=false` to hide the docs in production.


| Method | Path                                   | Who            | Purpose                                     |
| ------ | -------------------------------------- | -------------- | ------------------------------------------- |
| POST   | `/auth/register`, `/auth/login`        | public         | Get a JWT                                   |
| GET    | `/auth/me`                             | any user       | Current user                                |
| GET    | `/config`                              | public         | Timezone, currency, slot size               |
| GET    | `/services`                            | public         | Active treatments                           |
| GET    | `/therapists?serviceId=`               | public         | Therapists (optionally for a treatment)     |
| GET    | `/availability?serviceId=&date=&therapistId=` | public  | Free slots + who is free at each            |
| GET    | `/availability/at-time?serviceId=&startAt=` | public | Time-first: qualified therapists, free or not (with reason) |
| POST   | `/bookings`                            | any user       | Book (admin may pass `guest` / `clientId`)  |
| GET    | `/bookings/me`                         | any user       | My bookings                                 |
| PATCH  | `/bookings/:id/reschedule`             | owner / admin  | Move a booking (fully re-validated)          |
| PATCH  | `/bookings/:id/cancel`                 | owner / admin  | Cancel                                       |
| GET    | `/bookings?date=&therapistId=&status=` | admin / therapist | Schedule                                 |
| PATCH  | `/bookings/:id/status`                 | admin / therapist | Completed / no-show / cancelled          |
| CRUD   | `/services`, `/therapists`             | admin          | Includes `/therapists/:id/working-hours`, `/services`, `/time-off` |

---

## Project structure
```
tk_sig_SPA/
├── docker-compose.yml          Runs the PostgreSQL container
├── docker/postgres/            PostgreSQL Dockerfile + init script (btree_gist)
├── backend/                    NestJS API (TypeScript)
│   ├── scripts/                API test scripts (TypeScript): race-test.ts, rules-test.ts
│   ├── prisma/
│   │   ├── schema.prisma       Data model
│   │   ├── migrations/         SQL incl. exclusion constraints
│   │   └── seed.ts             Demo data
│   └── src/
│       ├── auth/               JWT, guards, roles
│       ├── availability/       Slot engine (pure + tested) and availability API
│       ├── bookings/           Create / reschedule / cancel with conflict handling
│       ├── therapists/         Skills, weekly hours, time off
│       └── services/           Treatment menu
└── frontend/                   React app (TypeScript)
    └── src/
        ├── components/         SlotPicker, ConflictNotice, Layout, UI kit
        ├── pages/              Home, Treatments, Book, My bookings, Auth
        └── pages/admin/        Schedule, Therapists, Services
```

## Suggested next steps
- Email/SMS/WhatsApp confirmations and reminders (e.g. a queue plus provider such as Twilio)
- Online deposits/payments (Stripe, Paynow)
- Treatment rooms and equipment as bookable resources (same exclusion-constraint pattern)
- Password reset flow; rate limiting on auth endpoints (`@nestjs/throttler`)
