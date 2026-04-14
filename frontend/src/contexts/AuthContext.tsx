import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { oidcClient, type Session } from "../auth/oidcClient";
import { supabase } from "../auth/supabaseClient";
import { getProfile, type Profile } from "../api/auth";

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const p = await getProfile();
      setProfile(p);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    // getSession() handles the OAuth PKCE code exchange (detects ?code= in the URL).
    // We use this for the initial load so the code is exchanged before any navigation.
    oidcClient.getSession().then(async (s) => {
      setSession(s);
      if (s) await fetchProfile();
      setLoading(false);
    });

    // onAuthStateChange handles subsequent changes (sign in, sign out, token refresh).
    // We skip INITIAL_SESSION here because getSession() above already covers it.
    const { data } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (event === "INITIAL_SESSION") return;
      const mapped: Session | null = s
        ? { access_token: s.access_token, user: { id: s.user.id, email: s.user.email } }
        : null;
      setSession(mapped);
      if (mapped) {
        await fetchProfile();
      } else {
        setProfile(null);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        refreshProfile: fetchProfile,
        signIn: (email, password) => oidcClient.signInWithPassword(email, password),
        signInWithGoogle: () => oidcClient.signInWithOAuth("google"),
        signUp: (email, password) => oidcClient.signUp(email, password),
        signOut: () => oidcClient.signOut(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
