// MAL au quotidien : rapprochement des nouvelles saisons avec le catalogue, puis mise à jour
// de la liste du compte connecté (ARCHITECTURE.md §10). Un anime en conflit ne bloque pas les autres.

import { browser } from "wxt/browser";
import { matchCandidates, type MalCandidate } from "../../core/catalog/match";
import { knownTotal } from "../../core/catalog/links";
import { decideMalUpdate } from "../../core/mal-sync/rules";
import type { Database } from "../storage/database";
import {
  getMalSync,
  putMalSync,
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

async function syncList(db: Database, s: mal.MalSession): Promise<void> {
  const { links, entries } = await readCatalog(db);
  const entryOf = new Map(entries.map((e) => [e.id, e]));
  const watched = await watchedBySeason(db);
  for (const link of links) {
    if (link.status !== "confirmed" || link.malId === undefined) continue;
    const numbers = watched.get(link.seasonId) ?? [];
    if (!numbers.length) continue;
    const state = (await getMalSync(db, link.malId)) ?? {
      malId: link.malId,
      updatedAt: Date.now(),
    };
    if (state.conflict) continue; // attend le choix de l'utilisateur
    const highest = Math.max(...numbers);
    if (state.ignoreUntil !== undefined && highest <= state.ignoreUntil)
      continue; // « Garder la valeur MAL »
    // Rien de nouveau depuis le dernier envoi : pas d'appel à MAL.
    if (
      state.lastSent !== undefined &&
      highest <= state.lastSent &&
      !state.question
    )
      continue;
    try {
      const remote = await mal.getMyStatus(s, link.malId);
      const entry = entryOf.get(link.malId);
      const decision = decideMalUpdate(remote, {
        watched: numbers,
        total: knownTotal(entry),
        ...(state.lastSent !== undefined && { lastSent: state.lastSent }),
        ...(state.previousAnswer !== undefined && {
          previousAnswer: state.previousAnswer,
        }),
      });
      const next = { ...state, updatedAt: Date.now() };
      delete next.lastError;
      if (decision.action === "update") {
        const result = await mal.updateMyStatus(s, link.malId, decision.fields);
        next.lastSent =
          result.num_episodes_watched ??
          decision.fields.num_watched_episodes ??
          state.lastSent ??
          0;
        delete next.question;
        await browser.storage.local.set({
          malLastSent: {
            title:
              entry?.alternative_titles?.en || entry?.title || `#${link.malId}`,
            count: next.lastSent,
            at: Date.now(),
          },
        });
      } else if (decision.action === "ask-previous") {
        next.question = { from: decision.from, to: decision.to };
      } else if (decision.action === "conflict") {
        next.conflict = {
          remote: decision.remote,
          lastSent: decision.lastSent,
        };
      } else if (next.lastSent === undefined) {
        // Rien à envoyer (MAL déjà à jour ou en avance) : le compteur MAL devient la référence.
        next.lastSent = remote?.num_episodes_watched ?? 0;
      }
      await putMalSync(db, next);
    } catch (error) {
      if (error instanceof mal.MalError && error.status === 401) {
        await browser.storage.local.set({ malNeedsReconnect: true });
        return;
      }
      await putMalSync(db, {
        ...state,
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: Date.now(),
      });
      if (error instanceof mal.MalError && error.status === 429) return; // on réessaie au prochain passage
    }
  }
}

let running: Promise<void> | null = null;

/** Un passage à la fois : catalogue puis liste. Silencieux si MAL n'est pas activé. */
export function runMal(db: Database, deviceId: string): Promise<void> {
  running ??= (async () => {
    if (!(await mal.hasMalAccess())) return;
    try {
      await resolveCatalog(db, deviceId);
      const s = await session();
      if (s) await syncList(db, s);
      await browser.storage.local.remove("malError");
    } catch (error) {
      await browser.storage.local.set({
        malError: error instanceof Error ? error.message : String(error),
      });
    }
  })().finally(() => {
    running = null;
  });
  return running;
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
