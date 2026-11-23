// Export et import de sauvegarde (Réglages). L'import n'efface rien : il fusionne
// (vu cumulatif, progression la plus récente) et envoie les nouveautés aux autres ordinateurs.

import type { BackupContent } from "../../core/backup/backup-file";
import type { EpisodeObservation } from "../../connectors/types";
import { contentIds } from "../../core/identity/ids";
import { mergeImportedVersion } from "../../core/sync/merge";
import { createOperation, type Operation } from "../../core/sync/operations";
import type { CatalogLink } from "../../core/catalog/links";
import type { Library, PlaybackVersion, SourceRef } from "../../shared/model";
import { readLibrary, type Database } from "./database";

export interface ImportReport {
  kind: BackupContent["kind"];
  /** Versions de lecture ajoutées ou complétées. */
  added: number;
  updated: number;
  unchanged: number;
  links: number;
}

export async function readBackupData(
  db: Database,
): Promise<{ library: Library; links: CatalogLink[] }> {
  return {
    library: await readLibrary(db),
    links: await db.getAll("catalogLinks"),
  };
}

function indexById<T extends { id: string }>(entries: T[]): Map<string, T> {
  const index = new Map<string, T>();
  for (const entry of entries) {
    if (!index.has(entry.id)) index.set(entry.id, entry);
  }
  return index;
}

function indexBackupRelations(lib: Library) {
  const versionRefs = new Map<string, SourceRef>();
  const animeRefs = new Map<string, Map<string, SourceRef>>();
  // Comme avec find(), la première source correspondante fait foi.
  for (const ref of lib.sourceRefs) {
    if (ref.entity === "version") {
      if (!versionRefs.has(ref.entityId)) versionRefs.set(ref.entityId, ref);
    } else if (ref.entity === "anime") {
      let bySite = animeRefs.get(ref.entityId);
      if (!bySite) {
        bySite = new Map();
        animeRefs.set(ref.entityId, bySite);
      }
      if (!bySite.has(ref.site)) bySite.set(ref.site, ref);
    }
  }
  return {
    episodes: indexById(lib.episodes),
    seasons: indexById(lib.seasons),
    animes: indexById(lib.animes),
    versionRefs,
    animeRefs,
  };
}

/** Retrouve l'observation qui recrée la version sur les autres ordinateurs. */
async function observationFor(
  relations: ReturnType<typeof indexBackupRelations>,
  v: PlaybackVersion,
): Promise<EpisodeObservation | undefined> {
  const episode = relations.episodes.get(v.episodeId);
  const season = episode && relations.seasons.get(episode.seasonId);
  const anime = season && relations.animes.get(season.animeId);
  const versionRef = relations.versionRefs.get(v.id);
  const animeRef =
    anime &&
    versionRef &&
    relations.animeRefs.get(anime.id)?.get(versionRef.site);
  if (!episode || !anime || !versionRef || !animeRef) return;
  // Les autres ordinateurs recalculent les identifiants : ils doivent retomber sur les mêmes.
  const ids = await contentIds(
    animeRef.site,
    animeRef.contentKey,
    episode.number,
    v.language,
  );
  if (ids.versionId !== v.id) return;
  return {
    site: animeRef.site,
    contentKey: animeRef.contentKey,
    title: anime.observedTitle,
    number: episode.number,
    language: v.language,
    url: versionRef.url ?? "",
  };
}

function operationsFor(
  observation: EpisodeObservation,
  v: PlaybackVersion,
  local: PlaybackVersion | undefined,
  deviceId: string,
  now: number,
): Operation[] {
  const ops: Operation[] = [
    createOperation(
      {
        type: "episode.opened",
        payload: {
          versionId: v.id,
          observation,
        },
      },
      deviceId,
      v.openedAt ?? v.updatedAt ?? now,
    ),
  ];
  const progressChanged =
    !local ||
    v.watched !== local.watched ||
    v.position !== local.position ||
    v.duration !== local.duration ||
    v.updatedAt !== local.updatedAt;
  if (progressChanged && (v.watched || v.position !== undefined)) {
    ops.push(
      createOperation(
        {
          type: "version.progress",
          payload: {
            id: v.id,
            position: v.position,
            duration: v.duration,
            watched: v.watched,
            updatedAt: v.updatedAt,
          },
        },
        deviceId,
        now,
      ),
    );
  }
  return ops;
}

export async function importBackup(
  db: Database,
  content: BackupContent,
  deviceId: string,
  now: number,
): Promise<ImportReport> {
  const { library: lib, links } = content;
  const report: ImportReport = {
    kind: content.kind,
    added: 0,
    updated: 0,
    unchanged: 0,
    links: 0,
  };

  // Le calcul asynchrone des identifiants précède la transaction IndexedDB.
  const relations = indexBackupRelations(lib);
  const prepared: { version: PlaybackVersion; observation: EpisodeObservation | undefined }[] = [];
  for (const v of lib.versions) {
    prepared.push({ version: v, observation: await observationFor(relations, v) });
  }
  const ops: Operation[] = [];

  const tx = db.transaction(
    [
      "animes",
      "seasons",
      "episodes",
      "versions",
      "sourceRefs",
      "catalogLinks",
      "outbox",
    ],
    "readwrite",
  );
  const done = tx.done;
  // Une requête et la transaction peuvent échouer en même temps.
  const settled = done.catch(() => {});
  try {
    for (const a of lib.animes)
      if (!(await tx.objectStore("animes").get(a.id)))
        await tx.objectStore("animes").put(a);
    for (const s of lib.seasons)
      if (!(await tx.objectStore("seasons").get(s.id)))
        await tx.objectStore("seasons").put(s);
    for (const e of lib.episodes)
      if (!(await tx.objectStore("episodes").get(e.id)))
        await tx.objectStore("episodes").put(e);
    // La fusion utilise l'état courant, y compris les opérations Cloud déjà appliquées.
    const versions = tx.objectStore("versions");
    for (const { version: v, observation } of prepared) {
      const local = await versions.get(v.id);
      const merged = mergeImportedVersion(local, {
        ...v,
        syncRevision: undefined,
      });
      if (merged.syncRevision === undefined) delete merged.syncRevision;
      if (!local) report.added++;
      else if (JSON.stringify(local) !== JSON.stringify(merged)) report.updated++;
      else {
        report.unchanged++;
        continue;
      }
      await versions.put(merged);
      if (observation)
        ops.push(...operationsFor(observation, merged, local, deviceId, now));
    }
    // Les adresses déjà connues sur cet ordinateur restent prioritaires.
    for (const r of lib.sourceRefs)
      if (!(await tx.objectStore("sourceRefs").get([r.site, r.contentKey])))
        await tx.objectStore("sourceRefs").put({ ...r, revision: undefined });
    for (const l of links) {
      const current = await tx.objectStore("catalogLinks").get(l.seasonId);
      // Un choix déjà fait ici n'est pas remplacé ; un rapprochement automatique, si.
      if (current && current.method === "user") continue;
      if (current && current.status === l.status && current.malId === l.malId)
        continue;
      await tx.objectStore("catalogLinks").put(l);
      ops.push(
        createOperation(
          {
            type: "catalog.linked",
            payload: {
              seasonId: l.seasonId,
              malId: l.malId,
              method: l.method,
              status: l.status,
            },
          },
          deviceId,
          now,
        ),
      );
      report.links++;
    }
    for (const op of ops) await tx.objectStore("outbox").put(op);
    await done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // IndexedDB a déjà terminé ou annulé la transaction.
    }
    await settled;
    throw error;
  }
  return report;
}

/** Copie 0.3.6 la plus récente conservée lors de la migration, s'il y en a une. */
export async function latestLegacyBackup(
  db: Database,
): Promise<{ at: number; history: Record<string, unknown> } | null> {
  const all = await db.getAll("legacyBackups");
  return all.sort((a, b) => b.at - a.at)[0] ?? null;
}
