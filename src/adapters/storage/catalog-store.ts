// Stockage des associations MAL, du cache catalogue et de l'état de la liste MAL.

import type {
  CatalogLink,
  MalEntry,
  MalSyncState,
} from "../../core/catalog/links";
import type { MalCandidate } from "../../core/catalog/match";
import { slugToTitle } from "../../core/catalog/match";
import { createOperation, type MalAnswer } from "../../core/sync/operations";
import { applyMalAnswer } from "../../core/mal-sync/answers";
import type { Database } from "./database";

export interface SeasonToResolve {
  seasonId: string;
  titles: string[];
}

/** Saisons sans association, à rechercher dans le catalogue. */
export async function seasonsToResolve(
  db: Database,
  limit: number,
): Promise<SeasonToResolve[]> {
  const [seasons, animes, refs, links] = await Promise.all([
    db.getAll("seasons"),
    db.getAll("animes"),
    db.getAll("sourceRefs"),
    db.getAll("catalogLinks"),
  ]);
  const linked = new Set(links.map((l) => l.seasonId));
  const titleOf = new Map(animes.map((a) => [a.id, a.observedTitle]));
  const slugOf = new Map(
    refs
      .filter((r) => r.entity === "anime")
      .map((r) => [r.entityId, r.contentKey]),
  );
  return seasons
    .filter((s) => !linked.has(s.id))
    .slice(0, limit)
    .map((s) => {
      const title = titleOf.get(s.animeId);
      const slug = slugOf.get(s.animeId);
      return {
        seasonId: s.id,
        titles: [
          ...new Set(
            [title, slug && slugToTitle(slug)].filter((t): t is string => !!t),
          ),
        ],
      };
    });
}

export async function saveEntries(
  db: Database,
  entries: MalCandidate[],
): Promise<void> {
  const tx = db.transaction("malEntries", "readwrite");
  const now = Date.now();
  await Promise.all([
    ...entries.map((e) => tx.store.put({ ...e, fetchedAt: now } as MalEntry)),
    tx.done,
  ]);
}

/** Enregistre une association ; une association confirmée est aussi envoyée aux autres ordinateurs. */
export async function saveLink(
  db: Database,
  link: CatalogLink,
  deviceId: string,
): Promise<void> {
  const tx = db.transaction(["catalogLinks", "outbox"], "readwrite");
  await tx.objectStore("catalogLinks").put(link);
  if (link.status !== "pending") {
    const { seasonId, malId, method, status } = link;
    await tx.objectStore("outbox").put(
      createOperation(
        {
          type: "catalog.linked",
          payload: {
            seasonId,
            status,
            ...(malId !== undefined && { malId }),
            ...(method && { method }),
          },
        },
        deviceId,
        link.at,
      ),
    );
  }
  await tx.done;
}

export async function getMalSync(
  db: Database,
  malId: number,
): Promise<MalSyncState | undefined> {
  return db.get("malSync", malId);
}

/** Sérialise la lecture et la modification avec les réponses locales et Cloud. */
export async function updateMalSync<Result = void>(
  db: Database,
  malId: number,
  update: (state: MalSyncState) => {
    next?: MalSyncState;
    result?: Result;
  },
): Promise<Result | undefined> {
  const tx = db.transaction("malSync", "readwrite");
  const current = (await tx.store.get(malId)) ?? {
    malId,
    updatedAt: Date.now(),
  };
  const { next, result } = update(current);
  if (next) await tx.store.put(next);
  await tx.done;
  return result;
}

/** Réponse de l'utilisateur (question des épisodes précédents, conflit), partagée entre ordinateurs. */
export async function answerMal(
  db: Database,
  malId: number,
  answer: MalAnswer,
  deviceId: string,
): Promise<void> {
  const tx = db.transaction(["malSync", "outbox"], "readwrite");
  const now = Date.now();
  const current = (await tx.objectStore("malSync").get(malId)) ?? {
    malId,
    updatedAt: now,
  };
  await tx.objectStore("malSync").put(applyMalAnswer(current, answer, now));
  await tx
    .objectStore("outbox")
    .put(
      createOperation(
        { type: "mal.answer", payload: { malId, ...answer } },
        deviceId,
        now,
      ),
    );
  await tx.done;
}

export async function readCatalog(db: Database) {
  const [links, entries, malSync] = await Promise.all([
    db.getAll("catalogLinks"),
    db.getAll("malEntries"),
    db.getAll("malSync"),
  ]);
  return { links, entries, malSync };
}
export type CatalogSnapshot = Awaited<ReturnType<typeof readCatalog>>;
