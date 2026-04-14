/**
 * OIDC client abstraction.
 *
 * The OIDCClient interface is the only auth surface the rest of the app
 * touches. The default implementation uses Supabase, but swapping to a
 * different provider only requires a new implementation of this interface
 * (and updating VITE_OIDC_PROVIDER + provider-specific env vars).
 */

import { supabase } from "./supabaseClient";

export interface Session {
  access_token: string;
  user: { id: string; email?: string };
}

export interface OIDCClient {
  signInWithPassword(email: string, password: string): Promise<void>;
  signInWithOAuth(provider: "google"): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  getSession(): Promise<Session | null>;
  onAuthStateChange(cb: (session: Session | null) => void): () => void;
}

export const oidcClient: OIDCClient = {
  async signInWithPassword(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  },

  async signInWithOAuth(provider) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
  },

  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    // If session is null after signup, email confirmation is required
    return { needsConfirmation: !data.session };
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return {
      access_token: data.session.access_token,
      user: { id: data.session.user.id, email: data.session.user.email },
    };
  },

  onAuthStateChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { cb(null); return; }
      cb({
        access_token: session.access_token,
        user: { id: session.user.id, email: session.user.email },
      });
    });
    return () => data.subscription.unsubscribe();
  },
};
