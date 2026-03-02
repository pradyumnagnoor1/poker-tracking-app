import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import LobbyView from "./lobby";
import GameView from "./game";
import ChipCountView from "./chip-count";
import PayoutsView from "./payouts";
import InviteCodeButton from "./InviteCodeButton";
import JoinRequestView from "./JoinRequestView";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: member } = await supabase
    .from("session_members")
    .select("role")
    .eq("session_id", id)
    .eq("user_id", user.id)
    .single();

  // Non-member: check if they have a pending/denied join request for an active session
  if (!member) {
    const { data: joinRequest } = await supabase
      .from("join_requests")
      .select("status")
      .eq("session_id", id)
      .eq("user_id", user.id)
      .single();

    if (joinRequest && (joinRequest.status === "pending" || joinRequest.status === "denied")) {
      return (
        <JoinRequestView
          sessionId={id}
          userId={user.id}
          initialStatus={joinRequest.status as "pending" | "denied"}
        />
      );
    }

    redirect("/dashboard");
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (!session) redirect("/dashboard");

  const isHost = member.role === "host";

  // Lobby has its own full-page layout
  if (session.state === "lobby") {
    return (
      <LobbyView
        sessionId={id}
        userId={user.id}
        isHost={isHost}
        buyInDefault={session.buy_in_default}
        inviteCode={session.invite_code}
        sessionTitle={session.title}
      />
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold">{session.title}</h1>
          <InviteCodeButton code={session.invite_code} />
        </div>
        <a href="/dashboard" className="text-gray-500 text-sm hover:text-white">← Back</a>
      </div>

      {session.state === "active" && (
        <GameView sessionId={id} userId={user.id} isHost={isHost} />
      )}
      {session.state === "chip_count" && (
        <ChipCountView sessionId={id} userId={user.id} isHost={isHost} />
      )}
      {(session.state === "payouts" || session.state === "closed") && (
        <PayoutsView sessionId={id} userId={user.id} isHost={isHost} sessionState={session.state} />
      )}
    </main>
  );
}
