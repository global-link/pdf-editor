import { oidcClient } from "../auth/oidcClient";

export const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

/**
 * fetch() wrapper that automatically attaches the current user's Bearer token.
 * Use this for all API calls that require authentication.
 */
export async function authedFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const session = await oidcClient.getSession();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return fetch(input, { ...init, headers });
}
