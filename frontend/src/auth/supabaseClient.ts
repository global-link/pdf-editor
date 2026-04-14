import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  console.warn(
    "[EditPDF] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. " +
    "Copy frontend/.env.example to frontend/.env and fill in your Supabase credentials."
  );
}

export const supabase = createClient(url || "", anonKey || "");
