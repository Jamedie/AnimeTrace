// Accès à l'API MyAnimeList v2 (ARCHITECTURE.md §10) : catalogue, connexion OAuth (PKCE),
// lecture et mise à jour de la liste. Seul module qui parle à MAL.

import { browser } from "wxt/browser";
import type { MalCandidate } from "../../core/catalog/match";

const API = "https://api.myanimelist.net/v2";
const OAUTH = "https://myanimelist.net/v1/oauth2";
const FIELDS =
  "alternative_titles,media_type,num_episodes,start_season,main_picture";

/** Accès dont MAL a besoin, demandés seulement quand l'utilisateur active MAL. */
export const MAL_ORIGINS = [
  "https://api.myanimelist.net/*",
  "https://myanimelist.net/*",
];

export class MalError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface MalSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userName?: string;
}

export interface MyListStatus {
  status?: "watching" | "completed" | "on_hold" | "dropped" | "plan_to_watch";
  num_episodes_watched?: number;
  score?: number;
}

function clientId(): string {
  const id = import.meta.env.WXT_MAL_CLIENT_ID as string | undefined;
  if (!id)
    throw new MalError(
      "Client ID MAL absent de la construction (WXT_MAL_CLIENT_ID).",
    );
  return id;
}

export async function hasMalAccess(): Promise<boolean> {
  return browser.permissions.contains({ origins: MAL_ORIGINS });
}

async function call<T>(
  url: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        ...(init.token
          ? { Authorization: `Bearer ${init.token}` }
          : { "X-MAL-CLIENT-ID": clientId() }),
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new MalError("MAL inaccessible. Nouvel essai plus tard.");
  }
  if (response.status === 401)
    throw new MalError("Connexion MAL expirée.", 401);
  if (response.status === 429)
    throw new MalError("MAL demande de patienter un peu.", 429);
  if (!response.ok)
    throw new MalError(`Erreur MAL (${response.status}).`, response.status);
  return (await response.json()) as T;
}

// --- Catalogue (sans compte) ---

export async function searchAnime(query: string): Promise<MalCandidate[]> {
  const q = query.trim().slice(0, 64);
  if (q.length < 3) return [];
  const data = await call<{ data: { node: MalCandidate }[] }>(
    `${API}/anime?q=${encodeURIComponent(q)}&limit=10&fields=${FIELDS}`,
  );
  return data.data.map((d) => d.node);
}

export async function getAnime(id: number): Promise<MalCandidate> {
  return call<MalCandidate>(`${API}/anime/${id}?fields=${FIELDS}`);
}

// --- Connexion du compte (OAuth 2, PKCE ; MAL n'accepte que la méthode « plain ») ---

function randomVerifier(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(96));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function token(body: Record<string, string>): Promise<MalSession> {
  let response: Response;
  try {
    response = await fetch(`${OAUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new MalError("MAL inaccessible pendant la connexion.");
  }
  if (!response.ok)
    throw new MalError(
      `Connexion MAL refusée (${response.status}).`,
      response.status,
    );
  const data = (await response.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/** Ouvre la page officielle de MAL ; l'utilisateur y accepte l'accès, puis revient automatiquement. */
export async function connect(): Promise<MalSession> {
  const verifier = randomVerifier();
  const state = crypto.randomUUID();
  const redirectUri = browser.identity.getRedirectURL();
  const url = `${OAUTH}/authorize?${new URLSearchParams({ response_type: "code", client_id: clientId(), code_challenge: verifier, code_challenge_method: "plain", state, redirect_uri: redirectUri })}`;
  const result = await browser.identity.launchWebAuthFlow({
    url,
    interactive: true,
  });
  if (!result) throw new MalError("Connexion MAL annulée.");
  const back = new URL(result);
  if (back.searchParams.get("state") !== state)
    throw new MalError("Réponse de connexion MAL invalide.");
  const code = back.searchParams.get("code");
  if (!code)
    throw new MalError(
      back.searchParams.get("error_description") ?? "Connexion MAL refusée.",
    );
  const session = await token({
    client_id: clientId(),
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });
  const me = await call<{ name: string }>(`${API}/users/@me`, {
    token: session.accessToken,
  });
  return { ...session, userName: me.name };
}

export async function refreshSession(session: MalSession): Promise<MalSession> {
  const next = await token({
    client_id: clientId(),
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
  });
  return { ...next, ...(session.userName && { userName: session.userName }) };
}

// --- Liste de l'utilisateur ---

export async function getMyStatus(
  session: MalSession,
  id: number,
): Promise<MyListStatus | null> {
  const data = await call<{ my_list_status?: MyListStatus }>(
    `${API}/anime/${id}?fields=my_list_status`,
    { token: session.accessToken },
  );
  return data.my_list_status ?? null;
}

/** Envoie uniquement les champs fournis ; la note n'est jamais transmise. */
export async function updateMyStatus(
  session: MalSession,
  id: number,
  fields: { status?: string; num_watched_episodes?: number },
): Promise<MyListStatus> {
  const body = new URLSearchParams();
  if (fields.status) body.set("status", fields.status);
  if (fields.num_watched_episodes !== undefined)
    body.set("num_watched_episodes", String(fields.num_watched_episodes));
  return call<MyListStatus>(`${API}/anime/${id}/my_list_status`, {
    method: "PATCH",
    token: session.accessToken,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}
