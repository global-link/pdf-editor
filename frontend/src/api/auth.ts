import { authedFetch, BASE_URL } from "./client";

const BASE = `${BASE_URL}/api/auth`;

export interface Profile {
  id: string;
  display_name: string | null;
  onboarding_completed: boolean;
  onboarding_step: number;
  created_at: string;
}

export async function getProfile(): Promise<Profile> {
  const res = await authedFetch(`${BASE}/profile`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateDisplayName(display_name: string): Promise<Profile> {
  const res = await authedFetch(`${BASE}/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateOnboardingStep(step: number): Promise<Profile> {
  const res = await authedFetch(`${BASE}/onboarding/step`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function completeOnboarding(): Promise<Profile> {
  const res = await authedFetch(`${BASE}/onboarding/complete`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
