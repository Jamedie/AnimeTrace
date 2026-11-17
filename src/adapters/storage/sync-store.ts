// Application locale des données synchronisées : opérations du journal cloud
// et historique cloud 0.3.6 (import en lecture seule, rejouable sans doublon).

import { contentIds, type ContentIds } from "../../core/identity/ids";
import { convertLegacyExport } from "../../core/backup/legacy-converter";
import {
  mergeImportedVersion,
  mergeOpenedAt,
  mergeRemoteProgress,
} from "../../core/sync/merge";
import type { Operation } from "../../core/sync/operations";
import { applyMalAnswer } from "../../core/mal-sync/answers";
import type { RemoteOperation } from "../supabase/client";
import type { Database } from "./database";

const CURSOR_KEY = "cloudCursor";

export async function getCursor(db: Database): Promise<number> {
  return ((await db.get("meta", CURSOR_KEY)) as number | undefined) ?? 0;
}

/** Opérations locales en attente, les plus anciennes d'abord. */
export async function pendingOperations(
  db: Database,
  limit = 200,
): Promise<Operation[]> {
  const all = await db.getAll("outbox");
  return all.sort((a, b) => a.createdAt - b.createdAt).slice(0, limit);
}

export async function removeOperations(
  db: Database,
  ids: string[],
): Promise<void> {
  const tx = db.transaction("outbox", "readwrite");
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

/** Applique les opérations reçues, dans l'ordre du serveur, puis avance le curseur. */
export async function applyRemoteOperations(
  db: Database,
  remote: RemoteOperation[],
): Promise<number> {
  if (!remote.length) return getCursor(db);
  // Les identifiants se calculent hors transaction (calcul asynchrone).
  const ids = new Map<string, ContentIds>();
  for (const { operation: op } of remote) {
    if (op.type === "episode.opened") {
      const o = op.payload.observation;
      ids.set(
        op.id,
        await contentIds(o.site, o.contentKey, o.number, o.language),
      );
    }
  }

  const tx = db.transaction(
    [
      "animes",
      "seasons",
      "episodes",
      "versions",
      "sourceRefs",
      "domains",
      "catalogLinks",
      "malSync",
      "meta",
    ],
    "readwrite",
  );
  let cursor =
    ((await tx.objectStore("meta").get(CURSOR_KEY)) as number | undefined) ?? 0;

  for (const { revision, operation: op } of remote) {
    if (op.type === "episode.opened") {
      const o = op.payload.observation;
      const id = ids.get(op.id)!;
      if (!(await tx.objectStore("animes").get(id.animeId))) {
        await tx
          .objectStore("animes")
          .put({ id: id.animeId, observedTitle: o.title });
        await tx
          .objectStore("seasons")
          .put({ id: id.seasonId, animeId: id.animeId, provisional: true });
        await tx.objectStore("sourceRefs").put({
          site: o.site,
          contentKey: o.contentKey,
          entity: "anime",
          entityId: id.animeId,
        });
      }
      if (!(await tx.objectStore("episodes").get(id.episodeId))) {
        await tx
          .objectStore("episodes")
          .put({ id: id.episodeId, seasonId: id.seasonId, number: o.number });
      }
      const version = (await tx.objectStore("versions").get(id.versionId)) ?? {
        id: id.versionId,
        episodeId: id.episodeId,
        language: o.language,
        watched: false,
      };
      await tx
        .objectStore("versions")
        .put(mergeOpenedAt(version, op.createdAt));
      // L'adresse la plus récente selon l'ordre du serveur.
      const ref = await tx
        .objectStore("sourceRefs")
        .get([o.site, id.versionKey]);
      if (!ref || (ref.revision ?? -1) < revision) {
        await tx.objectStore("sourceRefs").put({
          site: o.site,
          contentKey: id.versionKey,
          entity: "version",
          entityId: id.versionId,
          url: o.url,
          revision,
        });
      }
    } else if (op.type === "version.progress") {
      const version = await tx.objectStore("versions").get(op.payload.id);
      if (version)
        await tx
          .objectStore("versions")
          .put(mergeRemoteProgress(version, op.payload, revision));
    } else if (op.type === "domain.activated") {
      if (!(await tx.objectStore("domains").get(op.payload.host)))
        await tx.objectStore("domains").put(op.payload);
    } else if (op.type === "catalog.linked") {
      // Le choix de l'utilisateur prime sur un rapprochement automatique.
      const current = await tx
        .objectStore("catalogLinks")
        .get(op.payload.seasonId);
      if (!(current?.method === "user" && op.payload.method === "auto"))
        await tx
          .objectStore("catalogLinks")
          .put({ ...op.payload, at: op.createdAt });
    } else if (op.type === "mal.answer") {
      const current = (await tx
        .objectStore("malSync")
        .get(op.payload.malId)) ?? {
        malId: op.payload.malId,
        updatedAt: op.createdAt,
      };
      await tx
        .objectStore("malSync")
        .put(applyMalAnswer(current, op.payload, op.createdAt));
    }
    cursor = Math.max(cursor, revision);
  }
  await tx.objectStore("meta").put(cursor, CURSOR_KEY);
  await tx.done;
  return cursor;
}

/**
 * Importe l'historique cloud de la 0.3.6 sans le modifier. Rejouable :
 * mêmes identifiants déterministes, fusion « vu cumulatif, progression la plus récente ».
 */
export async function importLegacyHistory(
  db: Database,
  history: Record<string, unknown>,
): Promise<{ versions: number; rejected: number }> {
  const { library, rejected } = await convertLegacyExport({
    version: 1,
    history,
  });
  const tx = db.transaction(
    ["animes", "seasons", "episodes", "versions", "sourceRefs"],
    "readwrite",
  );
  for (const a of library.animes)
    if (!(await tx.objectStore("animes").get(a.id)))
      await tx.objectStore("animes").put(a);
  for (const s of library.seasons)
    if (!(await tx.objectStore("seasons").get(s.id)))
      await tx.objectStore("seasons").put(s);
  for (const e of library.episodes)
    if (!(await tx.objectStore("episodes").get(e.id)))
      await tx.objectStore("episodes").put(e);
  for (const v of library.versions)
    await tx
      .objectStore("versions")
      .put(mergeImportedVersion(await tx.objectStore("versions").get(v.id), v));
  // Les adresses déjà connues (plus récentes) ne sont pas remplacées par celles de la 0.3.6.
  for (const r of library.sourceRefs)
    if (!(await tx.objectStore("sourceRefs").get([r.site, r.contentKey])))
      await tx.objectStore("sourceRefs").put(r);
  await tx.done;
  return { versions: library.versions.length, rejected: rejected.length };
}
