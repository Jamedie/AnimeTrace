// Écriture des lectures dans IndexedDB. Chaque changement et son opération de
// synchronisation sont écrits dans la même transaction (ARCHITECTURE.md §8).

import type { EpisodeObservation } from "../../connectors/types";
import { contentIds } from "../../core/identity/ids";
import {
  applyOpened,
  applyProgress,
  type ProgressReport,
} from "../../core/history/playback";
import { createOperation } from "../../core/sync/operations";
import type { PlaybackVersion } from "../../shared/model";
import type { Database } from "./database";

const STORES = [
  "animes",
  "seasons",
  "episodes",
  "versions",
  "sourceRefs",
  "outbox",
] as const;

/** Page d'épisode ouverte : crée l'anime, la saison, l'épisode et la version si besoin. */
export async function recordOpened(
  db: Database,
  obs: EpisodeObservation,
  deviceId: string,
  now: number,
): Promise<PlaybackVersion> {
  const ids = await contentIds(
    obs.site,
    obs.contentKey,
    obs.number,
    obs.language,
  );
  const tx = db.transaction(STORES, "readwrite");

  if (!(await tx.objectStore("animes").get(ids.animeId))) {
    await tx
      .objectStore("animes")
      .put({ id: ids.animeId, observedTitle: obs.title });
    await tx
      .objectStore("seasons")
      .put({ id: ids.seasonId, animeId: ids.animeId, provisional: true });
    await tx
      .objectStore("sourceRefs")
      .put({
        site: obs.site,
        contentKey: obs.contentKey,
        entity: "anime",
        entityId: ids.animeId,
      });
  }
  if (!(await tx.objectStore("episodes").get(ids.episodeId))) {
    await tx
      .objectStore("episodes")
      .put({ id: ids.episodeId, seasonId: ids.seasonId, number: obs.number });
  }
  const version = applyOpened(
    await tx.objectStore("versions").get(ids.versionId),
    { id: ids.versionId, episodeId: ids.episodeId, language: obs.language },
    now,
  );
  await tx.objectStore("versions").put(version);
  // L'adresse la plus récente remplace l'ancienne : la bibliothèque rouvre le bon domaine.
  await tx
    .objectStore("sourceRefs")
    .put({
      site: obs.site,
      contentKey: ids.versionKey,
      entity: "version",
      entityId: ids.versionId,
      url: obs.url,
    });
  await tx
    .objectStore("outbox")
    .put(
      createOperation(
        {
          type: "episode.opened",
          payload: { observation: obs, versionId: ids.versionId },
        },
        deviceId,
        now,
      ),
    );
  await tx.done;
  return version;
}

/** Progression du lecteur pour une version déjà ouverte. Renvoie null si ignorée. */
export async function recordProgress(
  db: Database,
  versionId: string,
  report: ProgressReport,
  deviceId: string,
  now: number,
): Promise<PlaybackVersion | null> {
  const tx = db.transaction(["versions", "outbox"], "readwrite");
  const current = await tx.objectStore("versions").get(versionId);
  const next = current ? applyProgress(current, report, now) : null;
  if (next) {
    await tx.objectStore("versions").put(next);
    const { id, position, duration, watched, updatedAt } = next;
    await tx
      .objectStore("outbox")
      .put(
        createOperation(
          {
            type: "version.progress",
            payload: { id, position, duration, watched, updatedAt },
          },
          deviceId,
          now,
        ),
      );
  }
  await tx.done;
  return next;
}
