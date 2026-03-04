"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSession, signOut, addManualEntry, deleteManualEntry, toggleManualEntryVisibility } from "./actions";
import { createGroup, respondGroupInvite } from "../groups/actions";
import { createClient } from "@/supabase/client";
import PersonRow from "../payouts/PersonRow";
import type { PersonGroup } from "../payouts/types";
import StatsChart from "./StatsChart";
import SessionList from "./SessionList";
import DemoBanner from "./DemoBanner";
import FriendsTab from "./FriendsTab";
import UsernameSetupModal from "./UsernameSetupModal";

type Session = {
  id: string;
  title: string;
  state: string;
  invite_code: string;
  created_at: string;
  role: string;
};

type SessionStat = {
  id: string;
  title: string;
  date: string;
  profit: number;
  cumulative: number;
  isManual?: boolean;
  isPublic?: boolean;
};

type Tab = "play" | "stats" | "history" | "settle" | "friends";

type Group = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  member_count: number;
  is_owner: boolean;
  active_session_id: string | null;
  has_joined_active_session: boolean;
};

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

const PLAYER_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

type GroupInvite = {
  id: string;
  group_id: string;
  group_name: string;
  inviter_name: string;
};

export default function DashboardClient({
  fullName,
  userId,
  sessions,
  sessionStats,
  isAnonymous,
  groups,
  username,
  pendingFriendCount,
  pendingInviteCount,
  activeHostSessionId,
  pendingGroupInvites: initialGroupInvites,
}: {
  fullName: string;
  userId: string;
  sessions: Session[];
  sessionStats: SessionStat[];
  isAnonymous: boolean;
  groups: Group[];
  username: string | null;
  pendingFriendCount: number;
  pendingInviteCount: number;
  activeHostSessionId: string | null;
  pendingGroupInvites: GroupInvite[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"host" | "join" | null>(null);
  const [playerCount, setPlayerCount] = useState(6);
  const [tab, setTab] = useState<Tab>("play");
  const [showManualForm, setShowManualForm] = useState(false);
  const [shareWithFriends, setShareWithFriends] = useState(true);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleFetched, setSettleFetched] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupInvites, setGroupInvites] = useState<GroupInvite[]>(initialGroupInvites);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);

  const handleRespondGroupInvite = async (id: string, accept: boolean) => {
    setRespondingInviteId(id);
    try {
      await respondGroupInvite(id, accept);
      setGroupInvites((prev) => prev.filter((i) => i.id !== id));
      if (accept) router.refresh();
    } finally {
      setRespondingInviteId(null);
    }
  };

  useEffect(() => {
    if (groups.length === 0) return;
    const groupIds = new Set(groups.map((g) => g.id));
    const supabase = createClient();
    const channel = supabase
      .channel(`groups-live-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (payload) => {
        const row = (payload.new ?? payload.old) as { group_id?: string | null } | null;
        if (row?.group_id && groupIds.has(row.group_id)) {
          router.refresh();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groups, router, userId]);

  useEffect(() => {
    if (tab !== "settle" || settleFetched) return;
    const fetchPayments = async () => {
      setSettleLoading(true);
      const supabase = createClient();
      const { data: raw } = await supabase
        .from("payments")
        .select("*, session:sessions(id, title)")
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .neq("status", "confirmed")
        .order("created_at", { ascending: false });
      const all: Payment[] = raw ?? [];
      const otherIds = [...new Set(all.map((p) => p.from_user_id === userId ? p.to_user_id : p.from_user_id))];
      const { data: profiles } = otherIds.length
        ? await supabase.from("profiles").select("id, display_name").in("id", otherIds)
        : { data: [] };
      setProfileMap(Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name ?? "Unknown"])));
      setPayments(all);
      setSettleLoading(false);
      setSettleFetched(true);
    };
    fetchPayments();
  }, [tab, settleFetched, userId]);

  const activeSessions = sessions.filter((s) => s.state !== "closed" && s.state !== "payouts");
  const historySessions = sessions.filter((s) => s.state === "closed" || s.state === "payouts");
  const totalProfit = sessionStats.length > 0 ? sessionStats[sessionStats.length - 1].cumulative : null;
  const manualEntries = sessionStats.filter((s) => s.isManual);
  const [entryPublicState, setEntryPublicState] = useState<Record<string, boolean>>(
    Object.fromEntries(manualEntries.map((e) => [e.id, e.isPublic ?? true]))
  );

  const handleJoin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = (e.currentTarget.elements.namedItem("code") as HTMLInputElement).value.trim().toUpperCase();
    if (!code) return;
    setJoinLoading(true);
    const supabase = createClient();

    const { data: lobbySessionId, error: lobbyError } = await supabase.rpc("join_by_code", { p_code: code });
    if (!lobbyError && lobbySessionId) {
      router.push(`/sessions/${lobbySessionId}`);
      setModal(null);
      setJoinLoading(false);
      return;
    }

    const { data: sessionId, error: requestError } = await supabase.rpc("request_to_join_by_code", { p_code: code });
    if (!requestError && sessionId) {
      router.push(`/sessions/${sessionId}`);
      setModal(null);
      setJoinLoading(false);
      return;
    }

    alert(requestError?.message ?? lobbyError?.message ?? "Could not join session.");
    setJoinLoading(false);
  };

  const handleDeleteManualEntry = async (id: string) => {
    if (confirmDeleteEntry !== id) {
      setConfirmDeleteEntry(id);
      return;
    }
    setConfirmDeleteEntry(null);
    await deleteManualEntry(id);
    router.refresh();
  };

  const handleTogglePublic = async (id: string) => {
    const newVal = !(entryPublicState[id] ?? true);
    setEntryPublicState((prev) => ({ ...prev, [id]: newVal }));
    await toggleManualEntryVisibility(id, newVal);
    router.refresh();
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    setCreatingGroup(true);
    try {
      const groupId = await createGroup(name);
      setShowCreateGroupModal(false);
      setNewGroupName("");
      router.push(`/groups/${groupId}`);
    } catch (err) {
      alert((err as Error).message);
      setCreatingGroup(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Username setup modal for existing users without a username */}
      {!isAnonymous && !username && <UsernameSetupModal />}

      {/* Header */}
      <header className="px-5 pt-6 pb-4 max-w-lg mx-auto flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">
            Stack<span className="text-green-400">Lab</span>
          </h1>
          <p className="text-gray-500 text-sm">{isAnonymous ? "Demo User" : (username ? `@${username}` : fullName)}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isAnonymous && (
            <Link
              href="/settings"
              className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-800 active:text-white transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </Link>
          )}
          <form action={signOut}>
            <button className="text-gray-500 text-sm active:text-white transition-colors py-2 px-1">Sign Out</button>
          </form>
        </div>
      </header>

      {isAnonymous && (
        <div className="px-5 max-w-lg mx-auto mb-4">
          <DemoBanner />
        </div>
      )}

      {/* Tab content — padded above bottom nav */}
      <div className="px-5 max-w-lg mx-auto pb-32 space-y-6">

        {/* PLAY TAB */}
        {tab === "play" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setModal("join")}
                className="bg-blue-500/10 border border-blue-500/25 active:bg-blue-500/20 active:border-blue-500/50 rounded-2xl p-5 text-left transition-all min-h-[96px]"
              >
                <div className="w-9 h-9 bg-blue-500/20 rounded-xl flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                  </svg>
                </div>
                <p className="font-bold text-blue-400 text-sm">Join a Game</p>
                <p className="text-gray-600 text-xs mt-1">Enter invite code</p>
              </button>

              <button
                onClick={() => setModal("host")}
                className="bg-green-500/10 border border-green-500/25 active:bg-green-500/20 active:border-green-500/50 rounded-2xl p-5 text-left transition-all min-h-[96px]"
              >
                <div className="w-9 h-9 bg-green-500/20 rounded-xl flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <line x1="19" y1="8" x2="19" y2="14"/>
                    <line x1="22" y1="11" x2="16" y2="11"/>
                  </svg>
                </div>
                <p className="font-bold text-green-400 text-sm">Host a Game</p>
                <p className="text-gray-600 text-xs mt-1">Create a new session</p>
              </button>
            </div>

            {/* My Groups — hidden for anonymous/demo users */}
            {!isAnonymous && (
              <section>
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                    My Groups
                  </h2>
                  <button
                    onClick={() => setShowCreateGroupModal(true)}
                    className="text-xs text-green-400 active:text-green-300 font-semibold transition-colors py-1 px-2"
                  >
                    + Create
                  </button>
                </div>

                {groupInvites.length > 0 && (
                  <div className="flex flex-col gap-2 mb-3">
                    {groupInvites.map((invite) => (
                      <div
                        key={invite.id}
                        className="bg-gray-900 border border-blue-500/30 rounded-xl px-4 py-3"
                      >
                        <p className="text-sm font-medium">{invite.group_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Invited by {invite.inviter_name}
                        </p>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleRespondGroupInvite(invite.id, true)}
                            disabled={respondingInviteId === invite.id}
                            className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 active:bg-green-500/25 disabled:opacity-50 transition-colors"
                          >
                            {respondingInviteId === invite.id ? "Joining..." : "Accept"}
                          </button>
                          <button
                            onClick={() => handleRespondGroupInvite(invite.id, false)}
                            disabled={respondingInviteId === invite.id}
                            className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-gray-800 text-gray-400 border border-gray-700 active:bg-gray-700 disabled:opacity-50 transition-colors"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {groups.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {groups.map((g) => (
                      <Link
                        key={g.id}
                        href={`/groups/${g.id}`}
                        className={`active:bg-gray-800 rounded-xl px-4 py-3 flex items-center justify-between transition-colors ${
                          g.active_session_id
                            ? "bg-green-950/20 border border-green-500/40 shadow-[0_0_0_1px_rgba(34,197,94,0.15),0_0_18px_rgba(34,197,94,0.15)]"
                            : "bg-gray-900 border border-gray-800"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{g.name}</p>
                            {g.active_session_id && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-green-500/35 text-green-300 bg-green-500/10">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                Active Session
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {g.member_count} member{g.member_count !== 1 ? "s" : ""}
                            {g.is_owner ? " · Owner" : ""}
                            {g.active_session_id && g.has_joined_active_session ? " · Joined" : ""}
                          </p>
                        </div>
                        <svg
                          className="w-4 h-4 text-gray-600 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 border border-gray-800 border-dashed rounded-2xl">
                    <p className="text-gray-600 text-sm">No groups yet.</p>
                    <p className="text-gray-700 text-xs mt-1">
                      Create a group to quickly start games with regular players.
                    </p>
                  </div>
                )}
              </section>
            )}

            {activeSessions.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  Active Sessions
                </h2>
                <SessionList sessions={activeSessions} />
              </section>
            )}

            {activeSessions.length === 0 && (
              <div className="text-center py-10 border border-gray-800 border-dashed rounded-2xl">
                <p className="text-gray-600 text-sm">No active games.</p>
                <p className="text-gray-700 text-xs mt-1">Host or join a game to get started.</p>
              </div>
            )}
          </>
        )}

        {/* STATS TAB */}
        {tab === "stats" && (
          <>
            {sessionStats.length > 0 ? (
              <>
                {/* Lifetime P/L — hero number */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Lifetime P/L</p>
                  <p className={`text-5xl font-black tabular-nums ${totalProfit! >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {totalProfit! >= 0 ? `+$${totalProfit}` : `-$${Math.abs(totalProfit!)}`}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">Games</p>
                    <p className="text-2xl font-bold">{sessionStats.length}</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">Wins</p>
                    <p className="text-2xl font-bold text-green-400">
                      {sessionStats.filter((s) => s.profit > 0).length}
                    </p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">Losses</p>
                    <p className="text-2xl font-bold text-red-400">
                      {sessionStats.filter((s) => s.profit < 0).length}
                    </p>
                  </div>
                </div>

                <StatsChart stats={sessionStats} />
              </>
            ) : (
              <div className="text-center py-10 border border-gray-800 border-dashed rounded-2xl">
                <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">No stats yet.</p>
                <p className="text-gray-700 text-xs mt-1">Complete a game or add a manual entry below.</p>
              </div>
            )}

            {/* Manual Entries */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Manual Entries</h3>
                <button
                  onClick={() => setShowManualForm((v) => !v)}
                  className="text-xs text-blue-400 active:text-blue-300 transition-colors py-1 px-2"
                >
                  {showManualForm ? "Cancel" : "+ Add Entry"}
                </button>
              </div>

              {showManualForm && (
                <form
                  action={addManualEntry}
                  onSubmit={() => { setShowManualForm(false); setShareWithFriends(true); }}
                  className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-3 space-y-3"
                >
                  <input type="hidden" name="isPublic" value={shareWithFriends ? "true" : "false"} />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">Profit / Loss ($)</label>
                      <input
                        name="profit"
                        type="number"
                        step="any"
                        required
                        placeholder="e.g. -20 or 50"
                        className="w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded-xl px-3 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Date</label>
                      <input
                        name="playedAt"
                        type="date"
                        required
                        defaultValue={new Date().toISOString().split("T")[0]}
                        className="bg-gray-800 border border-gray-700 focus:border-blue-500 rounded-xl px-3 py-3 text-sm outline-none transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Notes (optional)</label>
                    <input
                      name="notes"
                      type="text"
                      placeholder="e.g. Home game at Jake's"
                      className="w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded-xl px-3 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
                    />
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-xs text-gray-500">Share with friends</span>
                    <button
                      type="button"
                      onClick={() => setShareWithFriends((v) => !v)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${shareWithFriends ? "bg-blue-500" : "bg-gray-700"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${shareWithFriends ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 active:bg-blue-500 text-white font-bold min-h-[48px] rounded-xl text-sm transition-colors"
                  >
                    Add Entry
                  </button>
                </form>
              )}

              {manualEntries.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {manualEntries.map((e) => (
                    <div key={e.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-3.5 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{e.title}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(e.date + "T00:00:00").toLocaleDateString()} · Manual
                          </p>
                        </div>
                        <span className={`text-lg font-bold tabular-nums ${e.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {e.profit >= 0 ? `+$${e.profit}` : `-$${Math.abs(e.profit)}`}
                        </span>
                      </div>
                      <div className="px-4 py-2 border-t border-gray-800/50 flex items-center justify-between">
                        <span className="text-xs text-gray-600">
                          {entryPublicState[e.id] ?? true ? "Shared with friends" : "Private"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleTogglePublic(e.id)}
                          className={`relative w-8 h-4 rounded-full transition-colors ${entryPublicState[e.id] ?? true ? "bg-blue-500" : "bg-gray-700"}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${entryPublicState[e.id] ?? true ? "translate-x-4" : "translate-x-0"}`} />
                        </button>
                      </div>
                      {confirmDeleteEntry === e.id ? (
                        <div className="border-t border-gray-800 flex">
                          <button
                            onClick={() => setConfirmDeleteEntry(null)}
                            className="flex-1 py-3 text-sm text-gray-400 active:bg-gray-800 transition-colors"
                          >
                            Cancel
                          </button>
                          <div className="w-px bg-gray-800" />
                          <button
                            onClick={() => handleDeleteManualEntry(e.id)}
                            className="flex-1 py-3 text-sm text-red-400 font-semibold active:bg-red-950/30 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDeleteManualEntry(e.id)}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-gray-800/50 text-gray-600 active:bg-gray-800 text-xs transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                          </svg>
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : !showManualForm && (
                <p className="text-gray-700 text-xs text-center py-4 border border-gray-800 border-dashed rounded-xl">
                  No manual entries yet. Add games you played outside the app.
                </p>
              )}
            </div>
          </>
        )}

        {/* SETTLE TAB */}
        {tab === "settle" && (
          <>
            {settleLoading ? (
              <div className="text-center py-16">
                <p className="text-gray-600 text-sm">Loading settlements…</p>
              </div>
            ) : (() => {
              const groups: PersonGroup[] = [];
              const seen = new Set<string>();
              for (const p of payments) {
                const otherId = p.from_user_id === userId ? p.to_user_id : p.from_user_id;
                if (seen.has(otherId)) continue;
                seen.add(otherId);
                const personPayments = payments.filter((pp) => {
                  const oid = pp.from_user_id === userId ? pp.to_user_id : pp.from_user_id;
                  return oid === otherId;
                });
                const iOweTotal = personPayments.filter((pp) => pp.from_user_id === userId).reduce((s, pp) => s + Number(pp.amount), 0);
                const theyOweTotal = personPayments.filter((pp) => pp.to_user_id === userId).reduce((s, pp) => s + Number(pp.amount), 0);
                groups.push({
                  counterpartyId: otherId,
                  name: profileMap[otherId] ?? "Unknown",
                  netToMe: theyOweTotal - iOweTotal,
                  payments: personPayments,
                  iOweTotal,
                  theyOweTotal,
                });
              }
              groups.sort((a, b) => a.netToMe - b.netToMe);

              const totalNetToMe = groups.reduce((s, g) => s + g.netToMe, 0);
              const totalIOwe = groups.filter((g) => g.netToMe < 0).reduce((s, g) => s + Math.abs(g.netToMe), 0);
              const totalIAmOwed = groups.filter((g) => g.netToMe > 0).reduce((s, g) => s + g.netToMe, 0);

              return (
                <>
                  {/* Hero summary */}
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Pending to Settle</p>
                    <p className={`text-5xl font-black tabular-nums ${totalNetToMe > 0 ? "text-green-400" : totalNetToMe < 0 ? "text-red-400" : "text-gray-400"}`}>
                      {totalNetToMe > 0 ? "+" : totalNetToMe < 0 ? "-" : ""}${Math.abs(totalNetToMe).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-600 mt-2">
                      {totalNetToMe === 0 ? "All cash transfers settled" : "Pending cash transfers — separate from your poker results"}
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

                  {groups.length === 0 ? (
                    <div className="text-center py-10 border border-gray-800 border-dashed rounded-2xl">
                      <p className="text-gray-600 text-sm">All settled up</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {groups.map((group) => (
                        <PersonRow key={group.counterpartyId} group={group} userId={userId} />
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}

        {/* FRIENDS TAB */}
        {tab === "friends" && !isAnonymous && (
          <FriendsTab userId={userId} activeSessionId={activeHostSessionId} />
        )}

        {/* HISTORY TAB */}
        {tab === "history" && (
          <>
            {historySessions.length > 0 ? (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  {historySessions.length} Completed Game{historySessions.length !== 1 ? "s" : ""}
                </h2>
                <SessionList sessions={historySessions} />
              </section>
            ) : (
              <div className="text-center py-16 border border-gray-800 border-dashed rounded-2xl">
                <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">No completed games yet.</p>
                <p className="text-gray-700 text-xs mt-1">Finished sessions will appear here.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Tab Bar */}
      <nav
        className="fixed bottom-0 inset-x-0 z-50 bg-gray-950/95 border-t border-gray-800 backdrop-blur-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex max-w-lg mx-auto">
          {/* Play */}
          <button
            onClick={() => setTab("play")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] transition-colors ${
              tab === "play" ? "text-white" : "text-gray-600 active:text-gray-400"
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill={tab === "play" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span className="text-[10px] font-semibold">Play</span>
          </button>

          {/* Friends */}
          {!isAnonymous && (
            <button
              onClick={() => setTab("friends")}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] transition-colors ${
                tab === "friends" ? "text-white" : "text-gray-600 active:text-gray-400"
              }`}
            >
              <div className="relative">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === "friends" ? "2.5" : "2"}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                {(pendingFriendCount + pendingInviteCount) > 0 && (
                  <span className="absolute -top-1 -right-2 text-[9px] font-bold bg-red-500 text-white rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
                    {pendingFriendCount + pendingInviteCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold">Friends</span>
            </button>
          )}

          {/* Stats */}
          <button
            onClick={() => setTab("stats")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] transition-colors ${
              tab === "stats" ? "text-white" : "text-gray-600 active:text-gray-400"
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === "stats" ? "2.5" : "2"}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold">Stats</span>
              {totalProfit !== null && (
                <span className={`text-[9px] font-bold ${totalProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {totalProfit >= 0 ? `+$${totalProfit}` : `-$${Math.abs(totalProfit)}`}
                </span>
              )}
            </div>
          </button>

          {/* History */}
          <button
            onClick={() => setTab("history")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] transition-colors ${
              tab === "history" ? "text-white" : "text-gray-600 active:text-gray-400"
            }`}
          >
            <div className="relative">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === "history" ? "2.5" : "2"}>
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              {historySessions.length > 0 && (
                <span className="absolute -top-1 -right-1.5 text-[9px] font-bold text-gray-400 bg-gray-800 rounded-full px-1 leading-4">
                  {historySessions.length}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold">History</span>
          </button>

          {/* Settle */}
          <button
            onClick={() => setTab("settle")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] transition-colors ${
              tab === "settle" ? "text-white" : "text-gray-600 active:text-gray-400"
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === "settle" ? "2.5" : "2"}>
              <polyline points="17 1 21 5 17 9"/>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            <span className="text-[10px] font-semibold">Settle</span>
          </button>
        </div>
      </nav>

      {/* Host Modal */}
      {modal === "host" && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 pb-8"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 32px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5 sm:hidden" />
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold">Host a Game</h2>
              <button
                onClick={() => setModal(null)}
                className="text-gray-600 w-9 h-9 flex items-center justify-center rounded-full active:bg-gray-800 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <form action={createSession} className="space-y-5">
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">Session Name</label>
                <input
                  name="title"
                  placeholder="e.g. Friday Night Poker"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">Max Players</label>
                <div className="flex gap-2 flex-wrap">
                  {PLAYER_COUNTS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPlayerCount(n)}
                      className={`w-11 h-11 rounded-xl text-sm font-semibold transition-colors ${
                        playerCount === n
                          ? "bg-green-500 text-black"
                          : "bg-gray-800 text-gray-400 active:bg-gray-700"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <input type="hidden" name="maxPlayers" value={playerCount} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">Default Buy-In ($)</label>
                <input
                  name="buyInDefault"
                  type="number"
                  min="1"
                  placeholder="e.g. 20"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-green-500 active:bg-green-400 text-black font-bold min-h-[52px] rounded-xl transition-colors"
              >
                Create Game
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4"
          onClick={() => setShowCreateGroupModal(false)}
        >
          <div
            className="bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 32px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5 sm:hidden" />
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold">Create Group</h2>
              <button
                onClick={() => setShowCreateGroupModal(false)}
                className="text-gray-600 w-9 h-9 flex items-center justify-center rounded-full active:bg-gray-800 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateGroup} className="space-y-5">
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">Group Name</label>
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Friday Night Crew"
                  autoFocus
                  className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={creatingGroup || !newGroupName.trim()}
                className="w-full bg-green-500 active:bg-green-400 disabled:opacity-50 text-black font-bold min-h-[52px] rounded-xl transition-colors"
              >
                {creatingGroup ? "Creating..." : "Create Group"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Join Modal */}
      {modal === "join" && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 32px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5 sm:hidden" />
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold">Join a Game</h2>
              <button
                onClick={() => setModal(null)}
                className="text-gray-600 w-9 h-9 flex items-center justify-center rounded-full active:bg-gray-800 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleJoin} className="space-y-5">
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">Invite Code</label>
                <input
                  name="code"
                  placeholder="ABC123"
                  maxLength={6}
                  autoComplete="off"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded-xl px-4 py-3 text-xl placeholder-gray-600 uppercase tracking-[0.3em] text-center font-mono outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={joinLoading}
                className="w-full bg-blue-500 active:bg-blue-400 disabled:opacity-50 text-white font-bold min-h-[52px] rounded-xl transition-colors"
              >
                {joinLoading ? "Joining…" : "Join Game"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
