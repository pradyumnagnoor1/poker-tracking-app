import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4">
      <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
      <p className="text-gray-400">Welcome, {user.user_metadata.full_name}</p>
    </main>
  );
}