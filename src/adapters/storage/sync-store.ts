// Application locale des opérations du journal cloud.

import { contentIds, type ContentIds } from "../../core/identity/ids";
import {
  mergeOpenedAt,
  mergeRemoteProgress,
} from "../../core/sync/merge";
import { createOperation, type LibraryChoice, type Operation } from "../../core/sync/operations";
import { applyMalAnswer } from "../../core/mal-sync/answers";
import type { RemoteOperation } from "../supabase/client";
import type { Database } from "./database";

const CURSOR_KEY = "cloudCursor";
const CHOICES_IMPORTED = "libraryChoicesImported";
type MetaStore = {
  get(key: string): Promise<unknown>;
  put(value: unknown, key: string): Promise<string>;
};

async function applyLibraryChoice(meta: MetaStore, choice: LibraryChoice) {
  if (choice.type === "library.hidden") {
    const { animeId, through } = choice.payload;
    const key = `library.hidden:${animeId}`;
    const current = await meta.get(key) as number | undefined;
    await meta.put(Math.max(current ?? 0, through), key);
  } else {
    const { seasonId, reviewed, confirmed } = choice.payload;
    const key = `library.previous:${seasonId}`;
    const current = await meta.get(key) as { reviewed: number; confirmed: number } | undefined;
    await meta.put({
      reviewed: Math.max(current?.reviewed ?? 0, reviewed),
      confirmed: Math.max(current?.confirmed ?? 0, confirmed),
    }, key);
  }
}

export async function saveLibraryChoices(
  db: Database,
  choices: LibraryChoice[],
  deviceId: string,
  importExisting = false,
) {
  const operations = choices.map((choice) => createOperation(choice, deviceId, Date.now()));
  const tx = db.transaction(["meta", "outbox"], "readwrite");
  const meta = tx.objectStore("meta");
  if (!importExisting || !(await meta.get(CHOICES_IMPORTED))) {
    for (const [index, choice] of choices.entries()) {
      await applyLibraryChoice(meta, choice);
      await tx.objectStore("outbox").put(operations[index]!);
    }
    if (importExisting) await meta.put(true, CHOICES_IMPORTED);
  }
  await tx.done;
}

export async function importLocalLibraryChoices(
  db: Database,
  stored: Record<string, unknown>,
  deviceId: string,
) {
  const choices: LibraryChoice[] = [];
  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith("library.hidden:") && typeof value === "number") {
      choices.push({ type: "library.hidden", payload: { animeId: key.slice("library.hidden:".length), through: value } });
    }
    if (key.startsWith("library.previous:") && value && typeof value === "object" &&
        "reviewed" in value && typeof value.reviewed === "number" &&
        "confirmed" in value && typeof value.confirmed === "number") {
      choices.push({ type: "library.previous", payload: {
        seasonId: key.slice("library.previous:".length), reviewed: value.reviewed, confirmed: value.confirmed,
      } });
    }
  }
  await saveLibraryChoices(db, choices, deviceId, true);
}


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
    } else if (op.type === "library.hidden" || op.type === "library.previous") {
      await applyLibraryChoice(tx.objectStore("meta"), op);
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
