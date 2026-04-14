import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { oidcClient, type Session } from "../auth/oidcClient";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hydrate from existing session on mount
    oidcClient.getSession().then((s) => {
      setSession(s);
      setLoading(false);
    });
    // Keep in sync with Supabase auth state changes (login, logout, token refresh)
    const unsubscribe = oidcClient.onAuthStateChange((s) => {
      setSession(s);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
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
