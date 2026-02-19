import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import { createSession, joinSession, signOut } from "./actions";
import DemoBanner from "./DemoBanner";
import SessionList from "./SessionList";
import StatsChart from "./StatsChart";

type Membership = {
  session_id: string;
  role: string;
  sessions: {
    id: string;
    title: string;
    state: string;
    invite_code: string;
    created_at: string;
  };
};

type SessionStat = {
  id: string;
  title: string;
  date: string;
  profit: number;
  cumulative: number;
};

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: memberships } = await supabase
    .from("session_members")
    .select("session_id, role, sessions(id, title, state, invite_code, created_at)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const sessions = (memberships as Membership[] | null)?.map((m) => ({
    ...m.sessions,
    role: m.role,
  })) || [];

  const isAnonymous = user.is_anonymous === true;

  // Compute stats for completed sessions (payouts or closed)
  const completedSessions = sessions.filter(
    (s) => s.state === "payouts" || s.state === "closed"
  );

  let sessionStats: SessionStat[] = [];

  if (completedSessions.length > 0) {
    const completedIds = completedSessions.map((s) => s.id);

    const [{ data: userBuyins }, { data: userChipCounts }] = await Promise.all([
      supabase
        .from("buyins")
        .select("session_id, amount")
        .eq("user_id", user.id)
        .in("session_id", completedIds),
      supabase
        .from("chip_counts")
        .select("session_id, final_stack")
        .eq("user_id", user.id)
        .in("session_id", completedIds),
    ]);

    const statsRaw = completedSessions
      .map((s) => {
        const chipCount = (userChipCounts ?? []).find((c) => c.session_id === s.id);
        if (!chipCount) return null;

        const totalIn = (userBuyins ?? [])
          .filter((b) => b.session_id === s.id)
          .reduce((sum, b) => sum + b.amount, 0);

        return {
          id: s.id,
          title: s.title,
          date: s.created_at,
          profit: Math.round((Number(chipCount.final_stack) - totalIn) * 100) / 100,
        };
      })
      .filter(Boolean) as Omit<SessionStat, "cumulative">[];

    statsRaw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    sessionStats = statsRaw.map((s) => {
      running = Math.round((running + s.profit) * 100) / 100;
      return { ...s, cumulative: running };
    });
  }

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      {isAnonymous && <DemoBanner />}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Poker Tracker</h1>
          <p className="text-gray-400 text-sm">
            {isAnonymous ? "Demo User" : user.user_metadata.full_name}
          </p>
        </div>
        <form action={signOut}>
          <button className="text-gray-500 text-sm hover:text-white">Sign Out</button>
        </form>
      </div>

      {sessionStats.length > 0 && <StatsChart stats={sessionStats} />}

      <form action={createSession} className="bg-gray-900 rounded-xl p-4 mb-4">
        <h2 className="font-semibold mb-3">Create Session</h2>
        <input
          name="title"
          placeholder="Session name (e.g. Friday Night)"
          className="w-full bg-gray-800 rounded-lg px-3 py-2 mb-2 text-sm placeholder-gray-500"
        />
        <input
          name="buyInDefault"
          type="number"
          placeholder="Default buy-in amount"
          className="w-full bg-gray-800 rounded-lg px-3 py-2 mb-3 text-sm placeholder-gray-500"
        />
        <button
          type="submit"
          className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg w-full text-sm"
        >
          Create Game
        </button>
      </form>

      <form action={joinSession} className="bg-gray-900 rounded-xl p-4 mb-6">
        <h2 className="font-semibold mb-3">Join Session</h2>
        <input
          name="code"
          placeholder="Enter invite code"
          maxLength={6}
          className="w-full bg-gray-800 rounded-lg px-3 py-2 mb-3 text-sm placeholder-gray-500 uppercase tracking-widest text-center"
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg w-full text-sm"
        >
          Join Game
        </button>
      </form>

      <div>
        <h2 className="font-semibold mb-3">Your Sessions</h2>
        <SessionList sessions={sessions} />
      </div>
    </main>
  );
}
