"use server";

import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";

export type FriendshipStatus = "none" | "pending" | "accepted" | "declined";

export type SearchResult = {
  id: string;
  display_name: string;
  username: string;
  friendship_status: FriendshipStatus;
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  other_user: {
    id: string;
    display_name: string;
    username: string;
  };
};

export type SessionInvite = {
  id: string;
  session_id: string;
  inviter_id: string;
  status: string;
  sessions: { id: string; title: string; state: string } | null;
  profiles: { id: string; display_name: string; username: string | null } | null;
};

export type FriendStats = {
  games_played: number;
  wins: number;
  losses: number;
  total_profit: number;
  average_profit: number;
};

export async function searchUsers(query: string): Promise<SearchResult[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await supabase.rpc("search_users_for_friends", { p_query: trimmed });
  if (error) throw new Error(error.message);
  return (data ?? []) as SearchResult[];
}

export async function sendFriendRequest(addresseeId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { error } = await supabase.rpc("send_friend_request", { p_addressee_id: addresseeId });
  if (error) throw new Error(error.message);
}

export async function respondFriendRequest(friendshipId: string, accept: boolean): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { error } = await supabase.rpc("respond_friend_request", {
    p_friendship_id: friendshipId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
}

export async function removeFriend(otherUserId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { error } = await supabase.rpc("remove_friend", { p_other_user_id: otherUserId });
  if (error) throw new Error(error.message);
}

export async function inviteFriendToSession(inviteeId: string, sessionId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { error } = await supabase.rpc("invite_friend_to_session", {
    p_invitee_id: inviteeId,
    p_session_id: sessionId,
  });
  if (error) throw new Error(error.message);
}

export async function acceptSessionInvite(inviteId: string): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data, error } = await supabase.rpc("accept_session_invite", { p_invite_id: inviteId });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function declineSessionInvite(inviteId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { error } = await supabase.rpc("decline_session_invite", { p_invite_id: inviteId });
  if (error) throw new Error(error.message);
}

export async function getFriendStats(friendId: string): Promise<FriendStats | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data, error } = await supabase.rpc("get_friend_stats", { p_friend_id: friendId });
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  const row = data[0];
  return {
    games_played: Number(row.games_played),
    wins: Number(row.wins),
    losses: Number(row.losses),
    total_profit: Number(row.total_profit),
    average_profit: Number(row.average_profit),
  };
}

export async function getFriendsData(userId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: friendships }, { data: pendingInvites }] = await Promise.all([
    supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status, requester:profiles!friendships_requester_id_fkey(id, display_name, username), addressee:profiles!friendships_addressee_id_fkey(id, display_name, username)")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .neq("status", "declined"),
    supabase
      .from("session_invites")
      .select("id, session_id, inviter_id, status, sessions(id, title, state), profiles!session_invites_inviter_id_fkey(id, display_name, username)")
      .eq("invitee_id", userId)
      .eq("status", "pending"),
  ]);

  const mappedFriendships: Friendship[] = (friendships ?? []).map((f: {
    id: string;
    requester_id: string;
    addressee_id: string;
    status: FriendshipStatus;
    requester: { id: string; display_name: string; username: string };
    addressee: { id: string; display_name: string; username: string };
  }) => ({
    id: f.id,
    requester_id: f.requester_id,
    addressee_id: f.addressee_id,
    status: f.status,
    other_user: f.requester_id === userId ? f.addressee : f.requester,
  }));

  return {
    friendships: mappedFriendships,
    sessionInvites: (pendingInvites ?? []) as SessionInvite[],
  };
}
