import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseAdminConfigured = Boolean(
  supabaseUrl && serviceRoleKey,
);

export const supabaseAdmin = isSupabaseAdminConfigured
  ? createClient(supabaseUrl as string, serviceRoleKey as string, {
      auth: { persistSession: false },
    })
  : null;
