# StackLab

A real-time home poker game tracker. Host a session, invite friends via a 6-character code, track buy-ins and rebuys, submit final chip counts, and automatically settle who pays who.

**Live:** [poker-tracking-app.vercel.app](https://poker-tracking-app.vercel.app)

---

## Features

- **Host & join games** — create a session and share a 6-character invite code
- **Real-time sync** — buy-ins, rebuys, chip counts, and payment statuses update live for all players
- **Early cashout** — players can cash out mid-game; host reviews and approves
- **Cashout simulator** — preview settlements before ending the game
- **Automatic settlements** — computes the minimum transfers needed to settle debts
- **Payment tracking** — payers mark as paid, receivers confirm; status syncs in real-time
- **Guest players** — host can add players without accounts
- **Stats dashboard** — lifetime P/L, win/loss record, and cumulative chart
- **Manual game entries** — log games played outside the app to include in lifetime stats
- **Game history** — view and remove completed games from your history

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + Realtime + Auth) |
| Auth | Google OAuth via Supabase |
| Hosting | Vercel |

---

## Local Development

```bash
cd frontend
npm install
npm run dev
```

Requires a `.env.local` file in `frontend/` with:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

---

## Database

SQL migration files are in the project root:

| File | Purpose |
|---|---|
| `rls_policies.sql` | Row-level security policies |
| `join_by_code.sql` | RPC for joining a session by invite code |
| `payments.sql` | Payment tracking schema and RPCs |
| `fix_profiles.sql` | Profile upsert fix |
| `fix_realtime.sql` | Add tables to realtime publication |
| `fix_session_members_rls.sql` | Session members RLS fix |
