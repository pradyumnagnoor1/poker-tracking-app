"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/supabase/client";
import {
    sendGroupInvite,
    removeGroupMember,
    deleteGroup,
    startGroupSession,
    joinActiveGroupSession,
    searchProfiles,
} from "../actions";

type Member = {
    user_id: string;
    joined_at: string;
    profiles: { display_name: string | null } | null;
};

type Group = {
    id: string;
    name: string;
    owner_id: string;
    created_at: string;
};

type ProfileResult = {
    id: string;
    display_name: string | null;
    username: string | null;
};

type Friend = {
    id: string;
    display_name: string | null;
    username: string | null;
};

export default function GroupDetailClient({
    group,
    members,
    currentUserId,
    isOwner,
    activeSessionId,
    hasJoinedActiveSession,
    friends,
}: {
    group: Group;
    members: Member[];
    currentUserId: string;
    isOwner: boolean;
    activeSessionId: string | null;
    hasJoinedActiveSession: boolean;
    friends: Friend[];
}) {
    const router = useRouter();
    const supabase = createClient();

    // Add member modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [addingUserId, setAddingUserId] = useState<string | null>(null);

    // Delete group
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Remove member
    const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);

    // Start session modal
    const [showStartModal, setShowStartModal] = useState(false);
    const [sessionTitle, setSessionTitle] = useState("");
    const [buyInDefault, setBuyInDefault] = useState("");
    const [starting, setStarting] = useState(false);
    const [joining, setJoining] = useState(false);

    const memberIds = new Set(members.map((m) => m.user_id));

    useEffect(() => {
        const channel = supabase
            .channel(`group-${group.id}-live`)
            .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `group_id=eq.${group.id}` }, () => router.refresh())
            .on("postgres_changes", { event: "*", schema: "public", table: "session_members" }, (payload) => {
                const sessionId = (payload.new as { session_id?: string } | null)?.session_id
                    ?? (payload.old as { session_id?: string } | null)?.session_id;
                if (activeSessionId && sessionId === activeSessionId) {
                    router.refresh();
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeSessionId, group.id, router, supabase]);

    const handleDeleteGroup = async () => {
        if (!confirmDelete) { setConfirmDelete(true); return; }
        setDeleting(true);
        try {
            await deleteGroup(group.id);
            router.push("/dashboard");
        } catch (err) {
            alert((err as Error).message);
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    const closeAddModal = () => {
        setShowAddModal(false);
        setSearchQuery("");
        setSearchResults([]);
    };

    const handleSearch = async () => {
        if (searchQuery.trim().length < 2) return;
        setSearching(true);
        try {
            const results = await searchProfiles(searchQuery);
            setSearchResults(results.filter((r) => !memberIds.has(r.id)));
        } finally {
            setSearching(false);
        }
    };

    const [inviteSentIds, setInviteSentIds] = useState<Set<string>>(new Set());

    const handleAddMember = async (userId: string) => {
        setAddingUserId(userId);
        try {
            await sendGroupInvite(group.id, userId);
            setInviteSentIds((prev) => new Set(prev).add(userId));
        } catch (err) {
            alert((err as Error).message);
        } finally {
            setAddingUserId(null);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (confirmRemoveId !== userId) {
            setConfirmRemoveId(userId);
            return;
        }
        setConfirmRemoveId(null);
        setRemovingId(userId);
        try {
            await removeGroupMember(group.id, userId);
            router.refresh();
        } catch (err) {
            alert((err as Error).message);
        } finally {
            setRemovingId(null);
        }
    };

    const handleStartSession = async (e: React.FormEvent) => {
        e.preventDefault();
        setStarting(true);
        try {
            const sessionId = await startGroupSession(
                group.id,
                sessionTitle || "Poker Night",
                buyInDefault ? parseFloat(buyInDefault) : null,
            );
            router.push(`/sessions/${sessionId}/lobby`);
        } catch (err) {
            alert((err as Error).message);
            setStarting(false);
        }
    };

    const handleJoinSession = async () => {
        setJoining(true);
        try {
            const sessionId = await joinActiveGroupSession(group.id);
            router.push(`/sessions/${sessionId}`);
        } catch (err) {
            alert((err as Error).message);
            setJoining(false);
        }
    };

    return (
        <main className="min-h-screen bg-gray-950 text-white">
            {/* Header */}
            <header className="px-5 pt-6 pb-4 max-w-lg mx-auto flex justify-between items-center">
                <button
                    onClick={() => router.push("/dashboard")}
                    className="text-gray-500 text-sm active:text-white transition-colors py-2"
                >
                    ← Back
                </button>
                <span className="text-sm font-bold">
                    Stack<span className="text-green-400">Lab</span>
                </span>
            </header>

            <div className="px-5 max-w-lg mx-auto pb-16 space-y-5">
                {/* Group info card */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h1 className="text-xl font-bold">{group.name}</h1>
                            <p className="text-xs text-gray-500 mt-1">
                                {members.length} member{members.length !== 1 ? "s" : ""}
                            </p>
                        </div>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border shrink-0 ${
                            isOwner
                                ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                                : "text-gray-400 bg-gray-800 border-gray-700"
                        }`}>
                            {isOwner ? "Owner" : "Member"}
                        </span>
                    </div>
                </div>

                <button
                    onClick={() => setShowStartModal(true)}
                    className="w-full bg-green-500 active:bg-green-400 disabled:opacity-60 text-black font-bold min-h-[52px] rounded-xl transition-colors"
                    disabled={Boolean(activeSessionId)}
                >
                    {activeSessionId ? "Active Session In Progress" : "Start Session with Group"}
                </button>

                {activeSessionId && (
                    <div className="bg-green-950/20 border border-green-500/35 rounded-2xl px-4 py-4 shadow-[0_0_0_1px_rgba(34,197,94,0.15),0_0_22px_rgba(34,197,94,0.12)]">
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <p className="text-sm font-semibold text-green-300 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-400" />
                                Active Session
                            </p>
                        </div>

                        {hasJoinedActiveSession ? (
                            <button
                                onClick={() => router.push(`/sessions/${activeSessionId}`)}
                                className="w-full bg-gray-900 border border-green-500/35 active:bg-gray-800 text-green-300 font-semibold min-h-[48px] rounded-xl transition-colors"
                            >
                                Open Session
                            </button>
                        ) : (
                            <button
                                onClick={handleJoinSession}
                                disabled={joining}
                                className="w-full bg-green-500 active:bg-green-400 disabled:opacity-60 text-black font-bold min-h-[48px] rounded-xl transition-colors"
                            >
                                {joining ? "Joining..." : "Join Session"}
                            </button>
                        )}
                    </div>
                )}

                {/* Delete group — owner only, two-step confirm */}
                {isOwner && (
                    confirmDelete ? (
                        <div className="flex gap-2">
                            <button
                                onClick={handleDeleteGroup}
                                disabled={deleting}
                                className="flex-1 bg-red-600 active:bg-red-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                            >
                                {deleting ? "Deleting..." : "Confirm Delete"}
                            </button>
                            <button
                                onClick={() => setConfirmDelete(false)}
                                className="flex-1 bg-gray-800 active:bg-gray-700 text-gray-400 font-semibold py-2.5 rounded-xl text-sm transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleDeleteGroup}
                            className="w-full text-red-500 active:text-red-400 text-sm font-semibold py-2 transition-colors"
                        >
                            Delete Group
                        </button>
                    )
                )}

                {/* Members section */}
                <section>
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                            Members
                        </h2>
                        {isOwner && (
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="text-xs text-green-400 active:text-green-300 font-semibold transition-colors py-1 px-2"
                            >
                                + Add Member
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        {members.map((m) => {
                            const displayName = m.profiles?.display_name ?? "Unknown";
                            const isMe = m.user_id === currentUserId;
                            const isGroupOwner = m.user_id === group.owner_id;

                            return (
                                <div
                                    key={m.user_id}
                                    className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between"
                                >
                                    <div>
                                        <p className="text-sm font-medium">
                                            {displayName}
                                            {isMe && (
                                                <span className="ml-1.5 text-xs text-gray-600">(You)</span>
                                            )}
                                        </p>
                                        {isGroupOwner && (
                                            <p className="text-xs text-amber-500 mt-0.5">Owner</p>
                                        )}
                                    </div>

                                    {/* Remove button: owner can remove non-owner members */}
                                    {isOwner && !isGroupOwner && (
                                        confirmRemoveId === m.user_id ? (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleRemoveMember(m.user_id)}
                                                    disabled={removingId === m.user_id}
                                                    className="text-xs bg-red-600 active:bg-red-500 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg font-semibold transition-colors"
                                                >
                                                    Remove
                                                </button>
                                                <button
                                                    onClick={() => setConfirmRemoveId(null)}
                                                    className="text-xs bg-gray-800 active:bg-gray-700 text-gray-400 px-2.5 py-1 rounded-lg transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleRemoveMember(m.user_id)}
                                                className="text-gray-600 hover:text-red-500 active:text-red-400 text-xs border border-gray-700 px-2.5 py-1 rounded-lg transition-colors"
                                            >
                                                Remove
                                            </button>
                                        )
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>

            {/* Add Member Modal */}
            {showAddModal && (
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4"
                    onClick={closeAddModal}
                >
                    <div
                        className="bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6"
                        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 32px)" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5 sm:hidden" />
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold">Add Member</h2>
                            <button
                                onClick={closeAddModal}
                                className="text-gray-600 w-9 h-9 flex items-center justify-center rounded-full active:bg-gray-800 transition-colors"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-5">
                            {/* Friends list */}
                            {(() => {
                                const availableFriends = friends.filter((f) => !memberIds.has(f.id));
                                if (availableFriends.length === 0) return null;
                                return (
                                    <div>
                                        <label className="text-xs font-medium text-gray-400 mb-2 block">Friends</label>
                                        <div className="flex flex-col gap-2">
                                            {availableFriends.map((f) => (
                                                <div
                                                    key={f.id}
                                                    className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between"
                                                >
                                                    <div>
                                                        <p className="text-sm font-medium">{f.display_name ?? f.username ?? "Unknown"}</p>
                                                        {f.username && <p className="text-xs text-gray-500">@{f.username}</p>}
                                                    </div>
                                                    <button
                                                        onClick={() => handleAddMember(f.id)}
                                                        disabled={addingUserId === f.id || inviteSentIds.has(f.id)}
                                                        className="text-xs bg-green-600 active:bg-green-500 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                                    >
                                                        {addingUserId === f.id ? "Sending..." : inviteSentIds.has(f.id) ? "Invited!" : "Invite"}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Search non-friends by username */}
                            <div>
                                <label className="text-xs font-medium text-gray-400 mb-2 block">Search by username</label>
                                <div className="flex gap-2">
                                    <input
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                        placeholder="@username"
                                        className="flex-1 bg-gray-800 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
                                    />
                                    <button
                                        onClick={handleSearch}
                                        disabled={searching || searchQuery.trim().length < 2}
                                        className="bg-gray-700 active:bg-gray-600 disabled:opacity-40 text-white font-semibold px-4 py-3 rounded-xl text-sm transition-colors"
                                    >
                                        {searching ? "..." : "Search"}
                                    </button>
                                </div>
                            </div>

                            {searchResults.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    {searchResults.map((p) => (
                                        <div
                                            key={p.id}
                                            className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between"
                                        >
                                            <div>
                                                <p className="text-sm font-medium">{p.display_name ?? p.username ?? "Unknown"}</p>
                                                {p.username && <p className="text-xs text-gray-500">@{p.username}</p>}
                                            </div>
                                            <button
                                                onClick={() => handleAddMember(p.id)}
                                                disabled={addingUserId === p.id || inviteSentIds.has(p.id)}
                                                className="text-xs bg-green-600 active:bg-green-500 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                            >
                                                {addingUserId === p.id ? "Sending..." : inviteSentIds.has(p.id) ? "Invited!" : "Invite"}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {searchResults.length === 0 && searchQuery.trim().length >= 2 && !searching && (
                                <p className="text-gray-600 text-xs text-center py-2">No users found.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Start Session Modal */}
            {showStartModal && (
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4"
                    onClick={() => setShowStartModal(false)}
                >
                    <div
                        className="bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6"
                        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 32px)" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5 sm:hidden" />
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold">Start Group Session</h2>
                            <button
                                onClick={() => setShowStartModal(false)}
                                className="text-gray-600 w-9 h-9 flex items-center justify-center rounded-full active:bg-gray-800 transition-colors"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        {/* Info banner */}
                        <div className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3 mb-5">
                            <p className="text-xs text-gray-400">
                                This starts an active session linked to this group. Members can join explicitly from the group page.
                            </p>
                        </div>

                        <form onSubmit={handleStartSession} className="space-y-5">
                            <div>
                                <label className="text-xs font-medium text-gray-400 mb-2 block">
                                    Session Name
                                </label>
                                <input
                                    value={sessionTitle}
                                    onChange={(e) => setSessionTitle(e.target.value)}
                                    placeholder="e.g. Friday Night Poker"
                                    className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-400 mb-2 block">
                                    Default Buy-In ($)
                                </label>
                                <input
                                    value={buyInDefault}
                                    onChange={(e) => setBuyInDefault(e.target.value)}
                                    type="number"
                                    min="1"
                                    placeholder="e.g. 20"
                                    className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-3 text-sm placeholder-gray-600 outline-none transition-colors"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={starting}
                                className="w-full bg-green-500 active:bg-green-400 disabled:opacity-50 text-black font-bold min-h-[52px] rounded-xl transition-colors"
                            >
                                {starting ? "Creating Session..." : "Start Session →"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}
