"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  searchUsers,
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
  inviteFriendToSession,
  acceptSessionInvite,
  declineSessionInvite,
  getFriendStats,
  getFriendsData,
  type Friendship,
  type SessionInvite,
  type SearchResult,
  type FriendStats,
} from "./friends-actions";

export default function FriendsTab({
  userId,
  activeSessionId,
}: {
  userId: string;
  activeSessionId: string | null;
}) {
  const router = useRouter();
  const [fetched, setFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [sessionInvites, setSessionInvites] = useState<SessionInvite[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [expandedFriendId, setExpandedFriendId] = useState<string | null>(null);
  const [friendStats, setFriendStats] = useState<Record<string, FriendStats | null>>({});
  const [loadingStats, setLoadingStats] = useState<string | null>(null);

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState<string | null>(null);
  const [invitedSet, setInvitedSet] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFriendsData(userId);
      setFriendships(data.friendships);
      setSessionInvites(data.sessionInvites);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [userId]);

  useEffect(() => {
    if (!fetched) load();
  }, [fetched, load]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchUsers(searchQuery);
        setSearchResults(results);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const handleSendRequest = async (addresseeId: string) => {
    setActionLoading(addresseeId);
    try {
      await sendFriendRequest(addresseeId);
      setSearchResults((prev) => prev.map((r) => r.id === addresseeId ? { ...r, friendship_status: "pending" } : r));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRespond = async (friendshipId: string, accept: boolean) => {
    setActionLoading(friendshipId);
    try {
      await respondFriendRequest(friendshipId, accept);
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (otherUserId: string) => {
    if (confirmRemoveId !== otherUserId) { setConfirmRemoveId(otherUserId); return; }
    setConfirmRemoveId(null);
    setActionLoading(otherUserId);
    try {
      await removeFriend(otherUserId);
      setFriendships((prev) => prev.filter((f) => f.other_user.id !== otherUserId));
      if (expandedFriendId === otherUserId) setExpandedFriendId(null);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleInvite = async (friendId: string) => {
    if (!activeSessionId) return;
    setInviteLoading(friendId);
    try {
      await inviteFriendToSession(friendId, activeSessionId);
      setInvitedSet((prev) => new Set([...prev, friendId]));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setInviteLoading(null);
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    setActionLoading(inviteId);
    try {
      const sessionId = await acceptSessionInvite(inviteId);
      router.push(`/sessions/${sessionId}`);
    } catch (err) {
      alert((err as Error).message);
      setActionLoading(null);
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    setActionLoading(inviteId);
    try {
      await declineSessionInvite(inviteId);
      setSessionInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleFriend = async (friend: Friendship) => {
    const fid = friend.other_user.id;
    if (expandedFriendId === fid) { setExpandedFriendId(null); return; }
    setExpandedFriendId(fid);
    if (!(fid in friendStats)) {
      setLoadingStats(fid);
      try {
        const stats = await getFriendStats(fid);
        setFriendStats((prev) => ({ ...prev, [fid]: stats }));
      } finally {
        setLoadingStats(null);
      }
    }
  };

  const pendingRequests = friendships.filter((f) => f.status === "pending" && f.addressee_id === userId);
  const sentRequests = friendships.filter((f) => f.status === "pending" && f.requester_id === userId);
  const acceptedFriends = friendships.filter((f) => f.status === "accepted");

  if (loading && !fetched) {
    return <div className="text-center py-16"><p className="text-gray-600 text-sm">Loading…</p></div>;
  }

  return (
    <div className="space-y-6">
      {/* Session Invites */}
      {sessionInvites.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Session Invites
          </h2>
          <div className="flex flex-col gap-2">
            {sessionInvites.map((inv) => (
              <div key={inv.id} className="bg-green-950/20 border border-green-500/30 rounded-xl overflow-hidden">
                <div className="px-4 py-3">
                  <p className="text-sm font-medium">
                    {inv.sessions?.title ?? "Poker Night"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Invited by <span className="text-white">
                      {inv.profiles?.display_name ?? "Someone"}
                    </span>
                    {inv.profiles?.username ? ` (@${inv.profiles.username})` : ""}
                  </p>
                </div>
                <div className="border-t border-green-500/20 flex">
                  <button
                    onClick={() => handleDeclineInvite(inv.id)}
                    disabled={actionLoading === inv.id}
                    className="flex-1 py-3 text-sm text-gray-400 active:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <div className="w-px bg-green-500/20" />
                  <button
                    onClick={() => handleAcceptInvite(inv.id)}
                    disabled={actionLoading === inv.id}
                    className="flex-1 py-3 text-sm text-green-400 font-semibold active:bg-green-950/30 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === inv.id ? "Joining…" : "Join Game"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Friend Requests ({pendingRequests.length})
          </h2>
          <div className="flex flex-col gap-2">
            {pendingRequests.map((f) => (
              <div key={f.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3">
                  <p className="text-sm font-medium">{f.other_user.display_name}</p>
                  {f.other_user.username && (
                    <p className="text-xs text-gray-500">@{f.other_user.username}</p>
                  )}
                </div>
                <div className="border-t border-gray-800 flex">
                  <button
                    onClick={() => handleRespond(f.id, false)}
                    disabled={actionLoading === f.id}
                    className="flex-1 py-3 text-sm text-gray-400 active:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <div className="w-px bg-gray-800" />
                  <button
                    onClick={() => handleRespond(f.id, true)}
                    disabled={actionLoading === f.id}
                    className="flex-1 py-3 text-sm text-green-400 font-semibold active:bg-green-950/30 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === f.id ? "…" : "Accept"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Search */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
          Find Friends
        </h2>
        <div className="flex items-center bg-gray-900 border border-gray-800 focus-within:border-blue-500 rounded-xl px-3 transition-colors mb-3">
          <svg className="w-4 h-4 text-gray-500 shrink-0 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username or name"
            className="flex-1 bg-transparent py-3 text-sm placeholder-gray-600 outline-none"
          />
          {searching && <span className="text-xs text-gray-500">…</span>}
          {searchQuery && !searching && (
            <button onClick={() => { setSearchQuery(""); setSearchResults([]); }} className="text-gray-600 active:text-gray-400 transition-colors p-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {searchQuery.trim().length >= 2 && searchResults.length === 0 && !searching && (
          <p className="text-gray-600 text-sm text-center py-4">No users found.</p>
        )}

        {searchResults.length > 0 && (
          <div className="flex flex-col gap-2">
            {searchResults.map((r) => (
              <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{r.display_name}</p>
                  <p className="text-xs text-gray-500">@{r.username}</p>
                </div>
                {r.friendship_status === "accepted" ? (
                  <span className="text-xs text-green-400 font-medium">Friends</span>
                ) : r.friendship_status === "pending" ? (
                  <span className="text-xs text-gray-500">Pending</span>
                ) : (
                  <button
                    onClick={() => handleSendRequest(r.id)}
                    disabled={actionLoading === r.id}
                    className="text-xs bg-blue-600 active:bg-blue-500 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {actionLoading === r.id ? "…" : "Add"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Friends List */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
          Friends {acceptedFriends.length > 0 ? `(${acceptedFriends.length})` : ""}
        </h2>

        {acceptedFriends.length === 0 && sentRequests.length === 0 ? (
          <div className="text-center py-8 border border-gray-800 border-dashed rounded-2xl">
            <p className="text-gray-600 text-sm">No friends yet.</p>
            <p className="text-gray-700 text-xs mt-1">Search by username above to connect.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {acceptedFriends.map((f) => {
              const fid = f.other_user.id;
              const isExpanded = expandedFriendId === fid;
              const stats = friendStats[fid];
              const isLoadingThisStats = loadingStats === fid;
              const isInvited = invitedSet.has(fid);
              return (
                <div key={f.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => handleToggleFriend(f)}
                    className="w-full px-4 py-3 flex items-center justify-between active:bg-gray-800 transition-colors"
                  >
                    <div className="text-left">
                      <p className="text-sm font-medium">{f.other_user.display_name}</p>
                      {f.other_user.username && (
                        <p className="text-xs text-gray-500">@{f.other_user.username}</p>
                      )}
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    >
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-800 px-4 py-3 space-y-3">
                      {/* Stats */}
                      {isLoadingThisStats ? (
                        <p className="text-xs text-gray-500 text-center py-2">Loading stats…</p>
                      ) : stats ? (
                        <div className="grid grid-cols-4 gap-2">
                          <div className="text-center">
                            <p className="text-lg font-bold">{stats.games_played}</p>
                            <p className="text-[10px] text-gray-500">Games</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-green-400">{stats.wins}</p>
                            <p className="text-[10px] text-gray-500">Wins</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-red-400">{stats.losses}</p>
                            <p className="text-[10px] text-gray-500">Losses</p>
                          </div>
                          <div className="text-center">
                            <p className={`text-lg font-bold tabular-nums ${stats.total_profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {stats.total_profit >= 0 ? `+$${stats.total_profit}` : `-$${Math.abs(stats.total_profit)}`}
                            </p>
                            <p className="text-[10px] text-gray-500">P/L</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600 text-center py-1">No completed games yet.</p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-1">
                        {activeSessionId && (
                          <button
                            onClick={() => handleInvite(fid)}
                            disabled={inviteLoading === fid || isInvited}
                            className="flex-1 bg-green-600 active:bg-green-500 disabled:opacity-50 text-white text-xs font-semibold min-h-[36px] rounded-lg transition-colors"
                          >
                            {isInvited ? "Invited!" : inviteLoading === fid ? "Inviting…" : "Invite to Game"}
                          </button>
                        )}
                        {confirmRemoveId === fid ? (
                          <>
                            <button
                              onClick={() => setConfirmRemoveId(null)}
                              className="flex-1 bg-gray-800 active:bg-gray-700 text-gray-300 text-xs font-semibold min-h-[36px] rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleRemove(fid)}
                              disabled={actionLoading === fid}
                              className="flex-1 bg-red-900/40 border border-red-500/30 active:bg-red-900/60 text-red-400 text-xs font-semibold min-h-[36px] rounded-lg transition-colors disabled:opacity-50"
                            >
                              Confirm Remove
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleRemove(fid)}
                            className="px-3 bg-gray-800 active:bg-gray-700 text-gray-500 text-xs font-medium min-h-[36px] rounded-lg transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Sent pending requests */}
            {sentRequests.map((f) => (
              <div key={f.id} className="bg-gray-900 border border-gray-800/50 rounded-xl px-4 py-3 flex items-center justify-between opacity-60">
                <div>
                  <p className="text-sm font-medium">{f.other_user.display_name}</p>
                  {f.other_user.username && (
                    <p className="text-xs text-gray-500">@{f.other_user.username}</p>
                  )}
                </div>
                <span className="text-xs text-gray-500 border border-gray-700 px-2 py-1 rounded-lg">Sent</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
