import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import { createSession, joinSession, signOut } from "./actions";
import Link from "next/link";

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

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Poker Tracker</h1>
          <p className="text-gray-400 text-sm">{user.user_metadata.full_name}</p>
        </div>
        <form action={signOut}>
          <button className="text-gray-500 text-sm hover:text-white">Sign Out</button>
        </form>
      </div>

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
        {sessions.length === 0 ? (
          <p className="text-gray-500 text-sm">No sessions yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/sessions/${s.id}`}
                className="bg-gray-900 rounded-xl p-4 flex justify-between items-center hover:bg-gray-800"
              >
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-gray-500 text-xs">
                    {s.role === "host" ? "Host" : "Player"} · {s.state}
                  </p>
                </div>
                <span className="text-gray-600 text-xs">{s.invite_code}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}