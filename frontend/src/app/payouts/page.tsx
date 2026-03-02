import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import PersonRow from "./PersonRow";
import type { Payment, PersonGroup } from "./types";

export default async function PayoutsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: rawPayments } = await supabase
    .from("payments")
    .select("*, session:sessions(id, title)")
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
    .neq("status", "confirmed")
    .order("created_at", { ascending: false });

  const payments: Payment[] = rawPayments ?? [];

  const otherIds = [...new Set(payments.map((p) =>
    p.from_user_id === user.id ? p.to_user_id : p.from_user_id
  ))];

  const { data: profiles } = otherIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", otherIds)
    : { data: [] };

  const profileMap: Record<string, string> = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p.display_name ?? "Unknown"])
  );

  // Group payments by counterparty and net across all sessions
  const groups: PersonGroup[] = [];
  const seen = new Set<string>();

  for (const p of payments) {
    const otherId = p.from_user_id === user.id ? p.to_user_id : p.from_user_id;
    if (seen.has(otherId)) continue;
    seen.add(otherId);

    const personPayments = payments.filter((pp) => {
      const oid = pp.from_user_id === user.id ? pp.to_user_id : pp.from_user_id;
      return oid === otherId;
    });

    const iOweTotal = personPayments
      .filter((pp) => pp.from_user_id === user.id)
      .reduce((s, pp) => s + Number(pp.amount), 0);
    const theyOweTotal = personPayments
      .filter((pp) => pp.to_user_id === user.id)
      .reduce((s, pp) => s + Number(pp.amount), 0);

    groups.push({
      counterpartyId: otherId,
      name: profileMap[otherId] ?? "Unknown",
      netToMe: theyOweTotal - iOweTotal,
      payments: personPayments,
      iOweTotal,
      theyOweTotal,
    });
  }

  // Sort: people you owe first, then people who owe you
  groups.sort((a, b) => a.netToMe - b.netToMe);

  const totalNetToMe = groups.reduce((s, g) => s + g.netToMe, 0);
  const totalIOwe = groups.filter((g) => g.netToMe < 0).reduce((s, g) => s + Math.abs(g.netToMe), 0);
  const totalIAmOwed = groups.filter((g) => g.netToMe > 0).reduce((s, g) => s + g.netToMe, 0);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-lg mx-auto px-5 py-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard" className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">Settlements</h1>
        </div>

        {/* Summary card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
            Pending to Settle
          </p>
          <p className={`text-4xl font-extrabold ${
            totalNetToMe > 0 ? "text-green-400" : totalNetToMe < 0 ? "text-red-400" : "text-gray-400"
          }`}>
            {totalNetToMe > 0 ? "+" : totalNetToMe < 0 ? "-" : ""}${Math.abs(totalNetToMe).toFixed(2)}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {totalNetToMe === 0
              ? "All cash transfers settled"
              : "Pending cash transfers — separate from your poker results"}
          </p>
          {(totalIOwe > 0 || totalIAmOwed > 0) && (
            <div className="flex gap-6 mt-4 pt-4 border-t border-gray-800">
              <div>
                <p className="text-xs text-gray-500 mb-1">You owe</p>
                <p className="text-lg font-bold text-red-400">${totalIOwe.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">You are owed</p>
                <p className="text-lg font-bold text-green-400">${totalIAmOwed.toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Per-person rows */}
        {groups.length === 0 ? (
          <div className="text-center py-16 border border-gray-800 border-dashed rounded-2xl">
            <p className="text-gray-500 text-sm">All settled up</p>
            <p className="text-gray-700 text-xs mt-1">No pending payments.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <PersonRow key={group.counterpartyId} group={group} userId={user.id} />
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
