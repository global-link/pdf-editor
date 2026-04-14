import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../auth/supabaseClient";

export function CallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Completing sign-in…");

  useEffect(() => {
    const search = window.location.search;
    const hash = window.location.hash;

    // Check for an explicit OAuth error from Supabase
    const errorSource = search.includes("error=") ? search : hash.slice(1);
    if (errorSource.includes("error=")) {
      const params = new URLSearchParams(errorSource);
      setStatus("Sign-in error: " + (params.get("error_description") ?? "unknown"));
      setTimeout(() => navigate("/login", { replace: true }), 3000);
      return;
    }

    // PKCE flow: exchange the code for a session
    if (search.includes("code=")) {
      supabase.auth.exchangeCodeForSession(search).then(({ error }) => {
        navigate(error ? "/login" : "/", { replace: true });
      });
      return;
    }

    // Implicit flow: check if session is already in localStorage,
    // otherwise wait for onAuthStateChange to process the hash tokens.
    let subscription: { unsubscribe: () => void } | null = null;
    const fallback = setTimeout(() => {
      subscription?.unsubscribe();
      navigate("/login", { replace: true });
    }, 10000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        clearTimeout(fallback);
        subscription?.unsubscribe();
        navigate("/", { replace: true });
        return;
      }
      // No session yet — wait for Supabase to process the hash tokens
      const { data } = supabase.auth.onAuthStateChange((event, s) => {
        if (event === "SIGNED_IN" && s) {
          clearTimeout(fallback);
          data.subscription.unsubscribe();
          navigate("/", { replace: true });
        }
      });
      subscription = data.subscription;
    });

    return () => {
      clearTimeout(fallback);
      subscription?.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="center" style={{ minHeight: "100vh" }}>
      <p style={{ color: "#888" }}>{status}</p>
    </div>
  );
}
