// Accès à Supabase (ARCHITECTURE.md §9) : connexion, envoi et lecture du journal,
// lecture seule de l'historique 0.3.6. Seul module qui parle au cloud.

import type { Operation } from "../../core/sync/operations";

export interface CloudConfig {
  url: string;
  key: string;
}

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresAt: number;
}

export interface RemoteOperation {
  revision: number;
  operation: Operation;
}

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function validateConfig(config: CloudConfig): CloudConfig {
  const url = config.url.trim().replace(/\/$/, "");
  const key = config.key.trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))
    throw new CloudError(
      "Indique l’adresse du projet, au format https://….supabase.co.",
    );
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))
    throw new CloudError(
      "Indique la clé publique, qui commence par sb_publishable_.",
    );
  return { url, key };
}

const MESSAGES: Record<number, string> = {
  400: "Demande refusée. Vérifie l’e-mail et le mot de passe.",
  401: "Connexion expirée ou identifiants incorrects.",
  403: "Accès refusé. Vérifie le compte et les règles de la base.",
  404: "Configuration cloud incomplète : exécute le fichier cloud/v1-operations.sql.",
};

async function request<T>(
  config: CloudConfig,
  path: string,
  init: { method: string; body?: unknown; token?: string; prefer?: string },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(config.url + path, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        apikey: config.key,
        ...(init.token && { Authorization: `Bearer ${init.token}` }),
        ...(init.prefer && { Prefer: init.prefer }),
      },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch {
    throw new CloudError(
      "Cloud inaccessible. Tes lectures restent enregistrées et partiront plus tard.",
    );
  }
  const text = await response.text();
  if (!response.ok) {
    // Le message « identifiants » ne vaut que pour la connexion ; ailleurs, on donne la vraie raison.
    const isAuth = path.startsWith("/auth/");
    let detail = "";
    try {
      detail = (JSON.parse(text) as { message?: string }).message ?? "";
    } catch {
      /* corps non JSON */
    }
    if (!isAuth && /check constraint/i.test(detail))
      throw new CloudError(
        "Base cloud à mettre à jour : réexécute cloud/v1-operations.sql dans Supabase.",
        response.status,
      );
    const known =
      isAuth || response.status !== 400 ? MESSAGES[response.status] : undefined;
    throw new CloudError(
      known ??
        `Erreur cloud (${response.status})${detail ? ` : ${detail}` : ""}. Nouvel essai plus tard.`,
      response.status,
    );
  }
  return (text ? JSON.parse(text) : null) as T;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string };
}

function toSession(data: TokenResponse): CloudSession {
  if (!data?.access_token || !data.refresh_token || !data.user?.id)
    throw new CloudError("Réponse de connexion invalide.");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: data.user.id,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function signIn(
  config: CloudConfig,
  email: string,
  password: string,
): Promise<CloudSession> {
  return toSession(
    await request<TokenResponse>(config, "/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: email.trim(), password },
    }),
  );
}

export async function refresh(
  config: CloudConfig,
  session: CloudSession,
): Promise<CloudSession> {
  return toSession(
    await request<TokenResponse>(
      config,
      "/auth/v1/token?grant_type=refresh_token",
      { method: "POST", body: { refresh_token: session.refreshToken } },
    ),
  );
}

export async function signOut(
  config: CloudConfig,
  session: CloudSession,
): Promise<void> {
  await request(config, "/auth/v1/logout?scope=local", {
    method: "POST",
    body: {},
    token: session.accessToken,
  });
}

/** Envoi idempotent : une opération déjà reçue est ignorée par le serveur. */
export async function pushOperations(
  config: CloudConfig,
  session: CloudSession,
  ops: Operation[],
): Promise<void> {
  if (!ops.length) return;
  const rows = ops.map((op) => ({
    id: op.id,
    device_id: op.deviceId,
    type: op.type,
    payload: op.payload,
    created_at: new Date(op.createdAt).toISOString(),
  }));
  await request(
    config,
    "/rest/v1/animetrace_operations?on_conflict=user_id,id",
    {
      method: "POST",
      body: rows,
      token: session.accessToken,
      prefer: "resolution=ignore-duplicates,return=minimal",
    },
  );
}

interface OperationRow {
  revision: number;
  id: string;
  device_id: string;
  type: Operation["type"];
  payload: Operation["payload"];
  created_at: string;
}

/** Opérations arrivées après « afterRevision », dans l'ordre du serveur. */
export async function pullOperations(
  config: CloudConfig,
  session: CloudSession,
  afterRevision: number,
  limit = 500,
): Promise<RemoteOperation[]> {
  const rows = await request<OperationRow[]>(
    config,
    `/rest/v1/animetrace_operations?select=revision,id,device_id,type,payload,created_at&revision=gt.${afterRevision}&order=revision.asc&limit=${limit}`,
    { method: "GET", token: session.accessToken },
  );
  return rows.map((r) => ({
    revision: r.revision,
    operation: {
      id: r.id,
      deviceId: r.device_id,
      type: r.type,
      payload: r.payload,
      createdAt: Date.parse(r.created_at),
    } as Operation,
  }));
}

/** Historique de la 0.3.6 (lecture seule, jamais modifié). Null si la table n'existe pas ou est vide. */
export async function readLegacyHistory(
  config: CloudConfig,
  session: CloudSession,
): Promise<Record<string, unknown> | null> {
  try {
    const rows = await request<{ history: Record<string, unknown> }[]>(
      config,
      "/rest/v1/anime_histories?select=history",
      { method: "GET", token: session.accessToken },
    );
    return rows[0]?.history ?? null;
  } catch (error) {
    if (error instanceof CloudError && error.status === 404) return null;
    throw error;
  }
}
