// Sauvegarde V1 (fichier JSON) : export complet et lecture d'un fichier à importer.
// Accepte aussi les exports de la 0.3.6, convertis avec les mêmes identifiants que la migration.

import type { Library } from "../../shared/model";
import type { CatalogLink } from "../catalog/links";
import { convertLegacyExport } from "./legacy-converter";
import type { ExportFile } from "./legacy-export";

export const BACKUP_FORMAT = "animetrace-backup";

export interface BackupContent {
  kind: "v1" | "legacy";
  library: Library;
  /** Associations MAL confirmées ou refusées (les propositions en attente sont recalculées). */
  links: CatalogLink[];
}

export function buildBackupFile(
  library: Library,
  links: CatalogLink[],
  at: number,
): ExportFile {
  const date = new Date(at).toISOString().slice(0, 10);
  const kept = links
    .filter((l) => l.status !== "pending")
    .map(({ candidates: _c, ...l }) => l);
  // Les numéros serveur sont propres à chaque ordinateur : ils ne voyagent pas dans le fichier.
  const versions = library.versions.map(({ syncRevision: _r, ...v }) => v);
  const sourceRefs = library.sourceRefs.map(({ revision: _r, ...r }) => r);
  return {
    filename: `animetrace-sauvegarde-${date}.json`,
    content: JSON.stringify(
      {
        format: BACKUP_FORMAT,
        version: 1,
        exportedAt: new Date(at).toISOString(),
        library: { ...library, versions, sourceRefs },
        catalogLinks: kept,
      },
      null,
      2,
    ),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

/** Lit un fichier de sauvegarde. Lève une erreur lisible si le fichier n'est pas reconnu. */
export async function parseBackupFile(text: string): Promise<BackupContent> {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new Error("Ce fichier n’est pas un JSON lisible.");
  }
  if (!isObj(data)) throw new Error("Fichier non reconnu.");

  if (data.format === BACKUP_FORMAT) {
    if (data.version !== 1)
      throw new Error(
        "Sauvegarde d’une version plus récente d’AnimeTrace : mets l’extension à jour.",
      );
    const lib = data.library;
    if (!isObj(lib))
      throw new Error("Sauvegarde incomplète : bibliothèque absente.");
    const arr = (k: string) =>
      Array.isArray(lib[k]) ? (lib[k] as unknown[]).filter(isObj) : [];
    const library: Library = {
      schemaVersion: 1,
      animes: arr("animes").filter(
        (a) => isStr(a.id) && isStr(a.observedTitle),
      ) as unknown as Library["animes"],
      seasons: arr("seasons").filter(
        (s) => isStr(s.id) && isStr(s.animeId),
      ) as unknown as Library["seasons"],
      episodes: arr("episodes").filter(
        (e) => isStr(e.id) && isStr(e.seasonId) && typeof e.number === "number",
      ) as unknown as Library["episodes"],
      versions: arr("versions").filter(
        (v) =>
          isStr(v.id) &&
          isStr(v.episodeId) &&
          (v.language === "VF" || v.language === "VOSTFR") &&
          typeof v.watched === "boolean",
      ) as unknown as Library["versions"],
      sourceRefs: arr("sourceRefs").filter(
        (r) =>
          isStr(r.site) &&
          isStr(r.contentKey) &&
          isStr(r.entityId) &&
          (r.entity === "anime" || r.entity === "version"),
      ) as unknown as Library["sourceRefs"],
    };
    const links = (Array.isArray(data.catalogLinks)
      ? data.catalogLinks.filter(isObj)
      : []
    ).filter(
      (l) =>
        isStr(l.seasonId) &&
        (l.status === "confirmed" || l.status === "rejected") &&
        (l.status === "rejected" || typeof l.malId === "number"),
    ) as unknown as CatalogLink[];
    return { kind: "v1", library, links };
  }

  // Export de la 0.3.6 : { version: 1, history: {…} }.
  if (data.version === 1 && isObj(data.history)) {
    const { library } = await convertLegacyExport(data);
    return { kind: "legacy", library, links: [] };
  }
  throw new Error(
    "Fichier non reconnu : choisis une sauvegarde AnimeTrace (V1 ou 0.3.6).",
  );
}
