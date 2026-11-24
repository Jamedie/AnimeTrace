// Synchronisation cloud du journal d’opérations entre ordinateurs.

import { browser } from "wxt/browser";
import type { Database } from "../storage/database";
import {
  applyRemoteOperations,
  getCursor,
  pendingOperations,
  removeOperations,
} from "../storage/sync-store";
import * as cloud from "./client";

export interface CloudStatus {
  configured: boolean;
  signedIn: boolean;
  email?: string;
  lastSuccess?: number;
  error?: string;
  pending: number;
}

interface Stored {
  cloudConfig?: cloud.CloudConfig;
  cloudSession?: cloud.CloudSession;
  cloudOwner?: string;
  cloudEmail?: string;
  cloudLastSuccess?: number;
  cloudError?: string;
}

const KEYS: (keyof Stored)[] = [
  "cloudConfig",
  "cloudSession",
  "cloudOwner",
  "cloudEmail",
  "cloudLastSuccess",
  "cloudError",
];
const PULL_OVERLAP = 50;

/**
 * Projet Supabase intégré à l'extension (adresse et clé publique, non secrètes), fixé à la construction
 * par WXT_SUPABASE_URL et WXT_SUPABASE_KEY. Un projet saisi dans les Réglages reste prioritaire.
 */
function builtInConfig(): cloud.CloudConfig | undefined {
  const url = import.meta.env.WXT_SUPABASE_URL as string | undefined;
  const key = import.meta.env.WXT_SUPABASE_KEY as string | undefined;
  if (!url || !key) return undefined;
  try {
    return cloud.validateConfig({ url, key });
  } catch {
    return undefined;
  }
}

async function stored(): Promise<Stored> {
  const s = (await browser.storage.local.get([...KEYS])) as Stored;
  s.cloudConfig ??= builtInConfig();
  return s;
}

export async function status(db: Database): Promise<CloudStatus> {
  const s = await stored();
  return {
    configured: !!s.cloudConfig,
    signedIn: !!s.cloudSession,
    ...(s.cloudEmail && { email: s.cloudEmail }),
    ...(s.cloudLastSuccess && { lastSuccess: s.cloudLastSuccess }),
    ...(s.cloudError && { error: s.cloudError }),
    pending: await db.count("outbox"),
  };
}

export async function configure(config: cloud.CloudConfig): Promise<void> {
  const valid = cloud.validateConfig(config);
  const s = await stored();
  // Le projet d'un historique déjà connecté ne change pas : évite de mélanger deux comptes.
  if (s.cloudOwner && s.cloudConfig && s.cloudConfig.url !== valid.url)
    throw new cloud.CloudError(
      "Le projet cloud ne peut pas être changé après connexion.",
    );
  await browser.storage.local.set({ cloudConfig: valid });
}

export async function signIn(
  db: Database,
  email: string,
  password: string,
): Promise<CloudStatus> {
  const s = await stored();
  if (!s.cloudConfig)
    throw new cloud.CloudError(
      "Indique d’abord l’adresse du projet et sa clé publique.",
    );
  const session = await cloud.signIn(s.cloudConfig, email, password);
  if (s.cloudOwner && s.cloudOwner !== session.userId)
    throw new cloud.CloudError(
      "Cet historique est lié à un autre compte. Reconnecte le compte initial.",
    );
  // Le mot de passe n'est jamais conservé ; seuls les jetons de session le sont, sur cet ordinateur.
  await browser.storage.local.set({
    cloudSession: session,
    cloudOwner: session.userId,
    cloudEmail: email.trim(),
  });
  return syncNow(db);
}

export async function signOut(db: Database): Promise<CloudStatus> {
  const s = await stored();
  if (s.cloudConfig && s.cloudSession)
    await cloud.signOut(s.cloudConfig, s.cloudSession).catch(() => {});
  await browser.storage.local.remove(["cloudSession", "cloudError"]);
  return status(db);
}

async function activeSession(
  config: cloud.CloudConfig,
  session: cloud.CloudSession,
): Promise<cloud.CloudSession> {
  if (session.expiresAt > Date.now() + 60_000) return session;
  const next = await cloud.refresh(config, session);
  await browser.storage.local.set({ cloudSession: next });
  return next;
}

let running: Promise<CloudStatus> | null = null;

/** Une synchronisation à la fois ; les demandes simultanées attendent la même. */
export function syncNow(db: Database): Promise<CloudStatus> {
  running ??= run(db).finally(() => {
    running = null;
  });
  return running;
}

async function run(db: Database): Promise<CloudStatus> {
  const s = await stored();
  if (!s.cloudConfig || !s.cloudSession) return status(db);
  try {
    const session = await activeSession(s.cloudConfig, s.cloudSession);

    // 1. Envoi d'abord : nos opérations reçoivent leur numéro avant la lecture.
    for (;;) {
      const batch = await pendingOperations(db, 200);
      if (!batch.length) break;
      await cloud.pushOperations(s.cloudConfig, session, batch);
      await removeOperations(
        db,
        batch.map((o) => o.id),
      );
    }

    // 2. Lecture, avec un léger chevauchement : réappliquer est sans effet.
    for (;;) {
      const after = Math.max(0, (await getCursor(db)) - PULL_OVERLAP);
      const page = await cloud.pullOperations(
        s.cloudConfig,
        session,
        after,
        500,
      );
      const before = await getCursor(db);
      await applyRemoteOperations(db, page);
      if (page.length < 500 || (await getCursor(db)) === before) break;
    }

    await browser.storage.local.set({ cloudLastSuccess: Date.now() });
    await browser.storage.local.remove("cloudError");
  } catch (error) {
    await browser.storage.local.set({
      cloudError: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof cloud.CloudError && error.status === 401)
      await browser.storage.local.remove("cloudSession");
  }
  return status(db);
}
