import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import PayoutCard from "./PayoutCard";
import PayoutsRealtimeListener from "./PayoutsRealtimeListener";

type Payment = {
  id: string;
  session_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  status: "pending" | "claimed" | "confirmed";
  created_at: string;
  session: { id: string; title: string } | null;
};

export default async function PayoutsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: rawPayments } = await supabase
    .from("payments")
    .select("*, session:sessions(id, title)")
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
    .neq("status", "confirmed")
    .order("created_at", { ascending: false });

  const payments: Payment[] = rawPayments ?? [];

  const otherIds = [
    ...new Set(
      payments.map((p) =>
        p.from_user_id === user.id ? p.to_user_id : p.from_user_id
      )
    ),
  ];

  const { data: profiles } = otherIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", otherIds)
    : { data: [] };

  const profileMap: Record<string, string> = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p.display_name ?? "Unknown"])
  );

  const iOwe = payments.filter((p) => p.from_user_id === user.id);
  const iAmOwed = payments.filter((p) => p.to_user_id === user.id);

  const totalIOwe = iOwe.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalIAmOwed = iAmOwed.reduce((sum, p) => sum + Number(p.amount), 0);
  const net = totalIAmOwed - totalIOwe;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-lg mx-auto px-5" style={{ paddingTop: "max(env(safe-area-inset-top), 24px)", paddingBottom: 32 }}>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/dashboard"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-900 border border-gray-800 active:bg-gray-800 transition-colors shrink-0"
          >
            <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">Settlements</h1>
        </div>

        {/* Net balance hero card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
            Net Balance
          </p>
          <p
            className={`text-5xl font-black tabular-nums ${
              net > 0 ? "text-green-400" : net < 0 ? "text-red-400" : "text-gray-400"
            }`}
          >
            {net > 0 ? "+" : net < 0 ? "-" : ""}${Math.abs(net).toFixed(2)}
          </p>
          <p className="text-xs text-gray-600 mt-2">
            {net > 0
              ? "You are owed more than you owe"
              : net < 0
              ? "You owe more than you are owed"
              : "You're all settled up"}
          </p>
          {(totalIOwe > 0 || totalIAmOwed > 0) && (
            <div className="flex gap-6 mt-4 pt-4 border-t border-gray-800">
              <div>
                <p className="text-xs text-gray-500 mb-1">You owe</p>
                <p className="text-2xl font-extrabold tabular-nums text-red-400">${totalIOwe.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">You are owed</p>
                <p className="text-2xl font-extrabold tabular-nums text-green-400">${totalIAmOwed.toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>

        {/* You Owe */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              You Owe
            </h2>
            <span className="text-base font-bold tabular-nums text-red-400">${totalIOwe.toFixed(2)}</span>
          </div>

          {iOwe.length === 0 ? (
            <div className="text-center py-8 border border-gray-800 border-dashed rounded-2xl">
              <p className="text-gray-600 text-sm">Nothing to pay 🎉</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {iOwe.map((payment) => (
                <PayoutCard
                  key={payment.id}
                  payment={payment}
                  otherName={profileMap[payment.to_user_id] ?? "Unknown"}
                  role="payer"
                />
              ))}
            </div>
          )}
        </section>

        {/* You Are Owed */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              You Are Owed
            </h2>
            <span className="text-base font-bold tabular-nums text-green-400">${totalIAmOwed.toFixed(2)}</span>
          </div>

          {iAmOwed.length === 0 ? (
            <div className="text-center py-8 border border-gray-800 border-dashed rounded-2xl">
              <p className="text-gray-600 text-sm">Nobody owes you</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {iAmOwed.map((payment) => (
                <PayoutCard
                  key={payment.id}
                  payment={payment}
                  otherName={profileMap[payment.from_user_id] ?? "Unknown"}
                  role="receiver"
                />
              ))}
            </div>
          )}
        </section>

      </div>
      <PayoutsRealtimeListener userId={user.id} />
    </main>
  );
}
