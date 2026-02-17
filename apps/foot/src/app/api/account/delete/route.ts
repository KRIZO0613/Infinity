import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isSupabaseAdminConfigured,
  supabaseAdmin,
} from "@/server/supabaseAdmin";

export const runtime = "nodejs";

type ApiResponse = { ok: true } | { error: string };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const createPublicClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
};

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json<ApiResponse>(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  const publicClient = createPublicClient();
  if (!publicClient) {
    return NextResponse.json<ApiResponse>(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return NextResponse.json<ApiResponse>(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }

  const { data: userData, error: userError } =
    await publicClient.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json<ApiResponse>(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }

  const userId = userData.user.id;

  try {
    await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
    await supabaseAdmin.from("club_members").delete().eq("user_id", userId);
    await supabaseAdmin.from("teams").delete().eq("user_id", userId);

    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Delete user error:", deleteError);
      return NextResponse.json<ApiResponse>(
        { error: "Unable to delete account" },
        { status: 500 },
      );
    }

    return NextResponse.json<ApiResponse>({ ok: true });
  } catch (error) {
    console.error("Account deletion failed:", error);
    return NextResponse.json<ApiResponse>(
      { error: "Unable to delete account" },
      { status: 500 },
    );
  }
}
