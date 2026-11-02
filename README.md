# StackLab

A real-time home poker tracker for organizing games, recording buy-ins and cashouts, and settling balances with friends.

[Open StackLab](https://poker-tracking-app.vercel.app) · [Local development](#local-development) · [Database](#database)

## Features

- **Host and join games:** create a session and share a six-character invite code.
- **Live game tracking:** synchronize buy-ins, rebuys, chip counts, and payment status.
- **Cashouts:** submit an early cashout for host approval or preview settlements before ending a game.
- **Settlements:** calculate transfers between players, then track payer reports and receiver confirmations.
- **Guest players:** include players without accounts.
- **Personal stats:** view lifetime profit/loss, game history, and cumulative results; include manually recorded games.
- **Friends and groups:** manage recurring poker groups, friend relationships, and invitations.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router and TypeScript |
| Interface | React 19, Tailwind CSS v4, Recharts |
| Backend | Supabase PostgreSQL, Realtime, and Auth |
| Sign-in | Google OAuth through Supabase |
| Hosting | Vercel |
| Native wrapper | Capacitor iOS project in `frontend/ios/` |

## Local development

Use Node.js compatible with Next.js 16 and npm.

```sh
git clone https://github.com/pradyumnagnoor1/poker-tracking-app.git
cd poker-tracking-app/frontend
npm ci
```

Create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Configure Google OAuth and the appropriate redirect URLs in your Supabase project, and provision its schema and access policies before using authenticated game flows.

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). After frontend dependencies are installed, the repository-root `dev`, `build`, `start`, and `lint` scripts forward to `frontend/`.

## Database

SQL files are under [sql_files/](sql_files/), rather than the repository root.

| Files | Area |
|---|---|
| `001_personal_sessions.sql`–`005_session_timing.sql` | Personal sessions, RPCs, analytics, indexes, and timing |
| `006_groups.sql`, `007_group_session_join_flow.sql` | Groups and group-session joining |
| `008_friends_manual_stats.sql`, `009_group_invites.sql` | Friends, manual stats, and group invitations |
| `rls_policies.sql`, `fix_session_members_rls.sql` | Row-level access policies |
| `join_by_code.sql`, `join_requests.sql` | Invite-code joining and join requests |
| `payments.sql` | Payment tracking schema and RPCs |
| `fix_profiles.sql`, `fix_realtime.sql` | Profile and Realtime fixes |

These include numbered changes and historical fixes, rather than a single documented clean-install migration chain. Inspect each script's prerequisites and the target database's existing schema before applying it.

## Development checks

Run from `frontend/`:

```sh
npm run lint
npx vitest run
npm run build
```

The repository includes settlement calculation tests in `src/__tests__/computeTransfers.test.ts`. These checks do not verify hosted OAuth, Realtime configuration, or production database policies.

## Repository map

```text
frontend/src/app/          Pages, session flows, groups, payouts, and settings
frontend/src/lib/          Settlement calculation
frontend/src/supabase/     Supabase client helpers
frontend/src/__tests__/    Settlement tests
frontend/ios/             Capacitor iOS wrapper
sql_files/                Database SQL scripts
```
