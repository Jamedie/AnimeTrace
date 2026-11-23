// MAL au quotidien : rapprochement des nouvelles saisons avec le catalogue, puis mise à jour
// de la liste du compte connecté (ARCHITECTURE.md §10). Un anime en conflit ne bloque pas les autres.

import { browser } from "wxt/browser";
import { matchCandidates, type MalCandidate } from "../../core/catalog/match";
import { knownTotal, type MalSyncState } from "../../core/catalog/links";
import { decideMalUpdate } from "../../core/mal-sync/rules";
import type { Database } from "../storage/database";
import {
  getMalSync,
  updateMalSync,
  readCatalog,
  saveEntries,
  saveLink,
  seasonsToResolve,
} from "../storage/catalog-store";
import * as mal from "./client";

export interface MalStatus {
  /** Accès aux adresses MAL accordé (catalogue utilisable). */
  enabled: boolean;
  connected: boolean;
  userName?: string;
  needsReconnect: boolean;
  pendingLinks: number;
  questions: number;
  conflicts: number;
  lastSent?: { title: string; count: number; at: number };
  error?: string;
}

interface Stored {
  malSession?: mal.MalSession;
  malNeedsReconnect?: boolean;
  malLastSent?: { title: string; count: number; at: number };
  malError?: string;
}
const KEYS: (keyof Stored)[] = [
  "malSession",
  "malNeedsReconnect",
  "malLastSent",
  "malError",
];

async function stored(): Promise<Stored> {
  return (await browser.storage.local.get([...KEYS])) as Stored;
}

export async function status(db: Database): Promise<MalStatus> {
  const s = await stored();
  const { links, malSync } = await readCatalog(db);
  return {
    enabled: await mal.hasMalAccess(),
    connected: !!s.malSession,
    ...(s.malSession?.userName && { userName: s.malSession.userName }),
    needsReconnect: !!s.malNeedsReconnect,
    pendingLinks: links.filter((l) => l.status === "pending").length,
    questions: malSync.filter((m) => m.question).length,
    conflicts: malSync.filter((m) => m.conflict).length,
    ...(s.malLastSent && { lastSent: s.malLastSent }),
    ...(s.malError && { error: s.malError }),
  };
}

/** Connexion du compte : la page officielle de MAL s'ouvre, puis l'utilisateur revient. */
export async function connect(db: Database): Promise<MalStatus> {
  const session = await mal.connect();
  await browser.storage.local.set({ malSession: session });
  await browser.storage.local.remove(["malNeedsReconnect", "malError"]);
  return status(db);
}

/** Déconnexion : jetons supprimés ; les mises à jour en attente sont conservées. */
export async function disconnect(db: Database): Promise<MalStatus> {
  await browser.storage.local.remove([
    "malSession",
    "malNeedsReconnect",
    "malError",
  ]);
  return status(db);
}

async function session(): Promise<mal.MalSession | null> {
  const s = await stored();
  if (!s.malSession) return null;
  if (s.malSession.expiresAt > Date.now() + 60_000) return s.malSession;
  try {
    const next = await mal.refreshSession(s.malSession);
    await browser.storage.local.set({ malSession: next });
    return next;
  } catch {
    await browser.storage.local.set({ malNeedsReconnect: true });
    return null;
  }
}

/** Recherche les saisons non associées (quelques-unes par passage, pour ménager l'API). */
async function resolveCatalog(db: Database, deviceId: string): Promise<void> {
  for (const season of await seasonsToResolve(db, 3)) {
    const found = new Map<number, MalCandidate>();
    for (const title of season.titles) {
      for (const c of await mal.searchAnime(title)) found.set(c.id, c);
      if (
        matchCandidates(season.titles, [...found.values()]).status ===
        "confirmed"
      )
        break;
    }
    const candidates = [...found.values()];
    await saveEntries(db, candidates);
    const result = matchCandidates(season.titles, candidates);
    await saveLink(
      db,
      result.status === "confirmed"
        ? {
            seasonId: season.seasonId,
            status: "confirmed",
            malId: result.malId,
            method: "auto",
            at: Date.now(),
          }
        : {
            seasonId: season.seasonId,
            status: "pending",
            candidates: result.candidates,
            at: Date.now(),
          },
      deviceId,
    );
  }
}

/** Les associations importées contiennent l'identifiant MAL, sans la fiche en cache. */
async function hydrateCatalog(db: Database): Promise<void> {
  const { links, entries } = await readCatalog(db);
  const cached = new Set(entries.map((entry) => entry.id));
  const missing = new Set<number>();
  for (const link of links) {
    if (
      link.status === "confirmed" &&
      link.malId !== undefined &&
      !cached.has(link.malId)
    ) {
      missing.add(link.malId);
    }
  }
  for (const id of [...missing].slice(0, 3)) {
    await saveEntries(db, [await mal.getAnime(id)]);
  }
}

/** Numéros d'épisodes vus par saison (VF et VOSTFR comptent une fois). */
async function watchedBySeason(db: Database): Promise<Map<string, number[]>> {
  const [episodes, versions] = await Promise.all([
    db.getAll("episodes"),
    db.getAll("versions"),
  ]);
  const seen = new Set(
    versions.filter((v) => v.watched).map((v) => v.episodeId),
  );
  const out = new Map<string, number[]>();
  for (const e of episodes)
    if (seen.has(e.id))
      out.set(e.seasonId, [...(out.get(e.seasonId) ?? []), e.number]);
  return out;
}

function shouldSync(highest: number, state?: MalSyncState): boolean {
  if (state?.conflict) return false;
  if (state?.ignoreUntil !== undefined && highest <= state.ignoreUntil)
    return false;
  return (
    state?.lastSent === undefined || highest > state.lastSent || !!state.question
  );
}

async function syncList(
  db: Database,
  s: mal.MalSession,
): Promise<"deferred" | void> {
  const { links, entries } = await readCatalog(db);
  const entryOf = new Map(entries.map((e) => [e.id, e]));
  const watched = await watchedBySeason(db);
  for (const link of links) {
    if (link.status !== "confirmed" || link.malId === undefined) continue;
    const numbers = watched.get(link.seasonId) ?? [];
    if (!numbers.length) continue;
    const malId = link.malId;
    const highest = Math.max(...numbers);
    if (!shouldSync(highest, await getMalSync(db, malId))) continue;
    try {
      const remote = await mal.getMyStatus(s, malId);
      const entry = entryOf.get(malId);
      const request = await updateMalSync<{
        response: Promise<{ count: number } | { error: unknown }>;
      }>(db, malId, (current) => {
        if (!shouldSync(highest, current)) return {};
        const decision = decideMalUpdate(remote, {
          watched: numbers,
          total: knownTotal(entry),
          ...(current.lastSent !== undefined && { lastSent: current.lastSent }),
          ...(current.previousAnswer !== undefined && {
            previousAnswer: current.previousAnswer,
          }),
        });
        if (decision.action === "update") {
          // Lancer l'envoi pendant que la lecture et les réponses sont sérialisées.
          // La transaction se termine sans attendre le réseau.
          const response = mal.updateMyStatus(s, malId, decision.fields).then(
            (result) => ({
              count:
                result.num_episodes_watched ??
                decision.fields.num_watched_episodes ??
                remote?.num_episodes_watched ??
                0,
            }),
            (error: unknown) => ({ error }),
          );
          return { result: { response } };
        }
        const next = { ...current, updatedAt: Date.now() };
        delete next.lastError;
        if (decision.action === "ask-previous") {
          next.question = { from: decision.from, to: decision.to };
        } else if (decision.action === "conflict") {
          next.conflict = { remote: decision.remote, lastSent: decision.lastSent };
        } else {
          next.lastSent ??= remote?.num_episodes_watched ?? 0;
        }
        return { next };
      });
      if (!request) continue;
      const result = await request.response;
      if ("error" in result) throw result.error;
      const { count } = result;
      await updateMalSync(db, malId, (current) => {
        const next = {
          ...current,
          lastSent: count,
          updatedAt: Date.now(),
        };
        delete next.lastError;
        delete next.question;
        return { next };
      });
      await browser.storage.local.set({
        malLastSent: {
          title: entry?.alternative_titles?.en || entry?.title || `#${malId}`,
          count,
          at: Date.now(),
        },
      });
    } catch (error) {
      if (error instanceof mal.MalError && error.status === 401) {
        await browser.storage.local.set({ malNeedsReconnect: true });
        return "deferred";
      }
      await updateMalSync(db, malId, (current) => ({
        next: {
          ...current,
          lastError: error instanceof Error ? error.message : String(error),
          updatedAt: Date.now(),
        },
      }));
      if (error instanceof mal.MalError && error.status === 429)
        return "deferred";
    }
  }
}

let running: Promise<void> | null = null;
let rerun = false;

/** Un passage à la fois : catalogue puis liste. Silencieux si MAL n'est pas activé. */
export function runMal(
  db: Database,
  deviceId: string,
  { rerunIfRunning = false } = {},
): Promise<void> {
  if (running) {
    rerun ||= rerunIfRunning;
    return running;
  }
  running = (async () => {
    do {
      rerun = false;
      if ((await runMalPass(db, deviceId)) === "deferred") break;
    } while (rerun);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function runMalPass(
  db: Database,
  deviceId: string,
): Promise<"deferred" | void> {
  if (!(await mal.hasMalAccess())) return;
  try {
    await resolveCatalog(db, deviceId);
    await hydrateCatalog(db);
    const s = await session();
    const outcome = s ? await syncList(db, s) : undefined;
    await browser.storage.local.remove("malError");
    return outcome;
  } catch (error) {
    await browser.storage.local.set({
      malError: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof mal.MalError && error.status === 429)
      return "deferred";
  }
}

/** Recherche manuelle pour l'écran de choix d'une fiche. */
export async function search(
  db: Database,
  query: string,
): Promise<MalCandidate[]> {
  const results = await mal.searchAnime(query);
  await saveEntries(db, results);
  return results;
}
