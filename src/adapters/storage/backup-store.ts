// Export et import de sauvegarde (Réglages). L'import n'efface rien : il fusionne
// (vu cumulatif, progression la plus récente) et envoie les nouveautés aux autres ordinateurs.

import type { BackupContent } from "../../core/backup/backup-file";
import { contentIds } from "../../core/identity/ids";
import { mergeImportedVersion } from "../../core/sync/merge";
import { createOperation, type Operation } from "../../core/sync/operations";
import type { CatalogLink } from "../../core/catalog/links";
import type { Library, PlaybackVersion } from "../../shared/model";
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

/** Prépare les opérations qui recréent une version importée sur les autres ordinateurs. */
async function operationsFor(
  lib: Library,
  v: PlaybackVersion,
  deviceId: string,
  now: number,
): Promise<Operation[]> {
  const episode = lib.episodes.find((e) => e.id === v.episodeId);
  const season = episode && lib.seasons.find((s) => s.id === episode.seasonId);
  const anime = season && lib.animes.find((a) => a.id === season.animeId);
  const versionRef = lib.sourceRefs.find(
    (r) => r.entity === "version" && r.entityId === v.id,
  );
  const animeRef =
    anime &&
    versionRef &&
    lib.sourceRefs.find(
      (r) =>
        r.entity === "anime" &&
        r.entityId === anime.id &&
        r.site === versionRef.site,
    );
  if (!episode || !anime || !versionRef || !animeRef) return [];
  // Les autres ordinateurs recalculent les identifiants : ils doivent retomber sur les mêmes.
  const ids = await contentIds(
    animeRef.site,
    animeRef.contentKey,
    episode.number,
    v.language,
  );
  if (ids.versionId !== v.id) return [];
  const ops: Operation[] = [
    createOperation(
      {
        type: "episode.opened",
        payload: {
          versionId: v.id,
          observation: {
            site: animeRef.site,
            contentKey: animeRef.contentKey,
            title: anime.observedTitle,
            number: episode.number,
            language: v.language,
            url: versionRef.url ?? "",
          },
        },
      },
      deviceId,
      v.openedAt ?? v.updatedAt ?? now,
    ),
  ];
  if (v.watched || v.position !== undefined) {
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

  // Calcul hors transaction (les identifiants sont asynchrones) : quelles versions changent.
  const changed: PlaybackVersion[] = [];
  for (const v of lib.versions) {
    const local = await db.get("versions", v.id);
    const merged = mergeImportedVersion(local, {
      ...v,
      syncRevision: undefined,
    });
    if (local?.syncRevision !== undefined)
      merged.syncRevision = local.syncRevision;
    else delete merged.syncRevision;
    if (!local) report.added++;
    else if (JSON.stringify(local) !== JSON.stringify(merged)) report.updated++;
    else {
      report.unchanged++;
      continue;
    }
    changed.push(merged);
  }
  const ops: Operation[] = [];
  for (const v of changed)
    ops.push(...(await operationsFor(lib, v, deviceId, now)));

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
  for (const a of lib.animes)
    if (!(await tx.objectStore("animes").get(a.id)))
      await tx.objectStore("animes").put(a);
  for (const s of lib.seasons)
    if (!(await tx.objectStore("seasons").get(s.id)))
      await tx.objectStore("seasons").put(s);
  for (const e of lib.episodes)
    if (!(await tx.objectStore("episodes").get(e.id)))
      await tx.objectStore("episodes").put(e);
  for (const v of changed) await tx.objectStore("versions").put(v);
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
  await tx.done;
  return report;
}

/** Copie 0.3.6 la plus récente conservée lors de la migration, s'il y en a une. */
export async function latestLegacyBackup(
  db: Database,
): Promise<{ at: number; history: Record<string, unknown> } | null> {
  const all = await db.getAll("legacyBackups");
  return all.sort((a, b) => b.at - a.at)[0] ?? null;
}
