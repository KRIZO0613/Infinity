import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const urlOk = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const keyOk = key.startsWith("sb_");
console.log("URL:", urlOk, "KEY_SB:", keyOk);
