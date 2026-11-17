// Convertisseur de la sauvegarde 0.3.6 (exportVersion 1) vers le modèle V1.
// Fonction pure : ne lit ni n'écrit aucun stockage, ne modifie jamais l'entrée.
// Règles : MODELE-DONNEES.md §5.

import type { Language, Library, PlaybackVersion } from "../../shared/model";
import { contentIds } from "../identity/ids";

const SITE = "voiranime";

export interface LegacyEntry {
  id: string;
  anime: string;
  title?: string;
  number: number;
  language: string;
  url?: string;
  thumbnail?: string;
  watched?: boolean;
  position?: number;
  duration?: number;
  updatedAt?: number;
  openedAt?: number;
}

export interface RejectedEntry {
  key: string;
  reason: string;
  raw: unknown;
}

export interface LegacyConversion {
  library: Library;
  /** Ancienne clé → identifiant de la version de lecture créée. */
  keyMap: Record<string, string>;
  rejected: RejectedEntry[];
}

function validate(key: string, raw: unknown): LegacyEntry | string {
  if (!raw || typeof raw !== "object") return "entrée non objet";
  const e = raw as Record<string, unknown>;
  if (typeof e.anime !== "string" || !e.anime) return "anime manquant";
  if (
    typeof e.number !== "number" ||
    !Number.isFinite(e.number) ||
    e.number < 0
  )
    return "numéro invalide";
  const lang = typeof e.language === "string" ? e.language.toUpperCase() : "";
  if (lang !== "VF" && lang !== "VOSTFR") return "langue inconnue";
  const expected = `${e.anime}:${e.number}:${lang.toLowerCase()}`;
  if (key !== expected) return `clé incohérente (attendu ${expected})`;
  for (const f of ["position", "duration", "updatedAt", "openedAt"] as const) {
    if (
      e[f] !== undefined &&
      (typeof e[f] !== "number" || !Number.isFinite(e[f]))
    )
      return `champ ${f} invalide`;
  }
  if (e.watched !== undefined && typeof e.watched !== "boolean")
    return "champ watched invalide";
  return { ...(e as unknown as LegacyEntry), id: key, language: lang };
}

export async function convertLegacyExport(
  input: unknown,
): Promise<LegacyConversion> {
  if (!input || typeof input !== "object")
    throw new Error("Sauvegarde illisible");
  const root = input as { version?: unknown; history?: unknown };
  if (root.version !== 1)
    throw new Error(
      `Version de sauvegarde non prise en charge : ${String(root.version)}`,
    );
  if (!root.history || typeof root.history !== "object")
    throw new Error("Historique absent");

  const library: Library = {
    schemaVersion: 1,
    animes: [],
    seasons: [],
    episodes: [],
    versions: [],
    sourceRefs: [],
  };
  const keyMap: Record<string, string> = {};
  const rejected: RejectedEntry[] = [];
  const seenAnime = new Set<string>();
  const seenEpisode = new Set<string>();

  // Tri des clés : résultat identique quel que soit l'ordre du fichier.
  const entries = Object.entries(root.history as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );

  for (const [key, raw] of entries) {
    const entry = validate(key, raw);
    if (typeof entry === "string") {
      rejected.push({ key, reason: entry, raw });
      continue;
    }
    const slug = entry.anime;
    const { animeId, seasonId, episodeId, versionId } = await contentIds(
      SITE,
      slug,
      entry.number,
      entry.language as Language,
    );

    if (!seenAnime.has(slug)) {
      seenAnime.add(slug);
      library.animes.push({ id: animeId, observedTitle: entry.title ?? slug });
      library.seasons.push({ id: seasonId, animeId, provisional: true });
      library.sourceRefs.push({
        site: SITE,
        contentKey: slug,
        entity: "anime",
        entityId: animeId,
      });
    }
    if (!seenEpisode.has(episodeId)) {
      seenEpisode.add(episodeId);
      library.episodes.push({ id: episodeId, seasonId, number: entry.number });
    }

    const version: PlaybackVersion = {
      id: versionId,
      episodeId,
      language: entry.language as Language,
      watched: entry.watched === true,
    };
    // Copie exacte des champs présents ; un champ absent reste absent.
    for (const f of [
      "position",
      "duration",
      "updatedAt",
      "openedAt",
    ] as const) {
      if (entry[f] !== undefined) version[f] = entry[f];
    }
    library.versions.push(version);
    library.sourceRefs.push({
      site: SITE,
      contentKey: key,
      entity: "version",
      entityId: versionId,
      ...(entry.url !== undefined && { url: entry.url }),
      ...(entry.thumbnail !== undefined && { thumbnail: entry.thumbnail }),
    });
    keyMap[key] = versionId;
  }

  return { library, keyMap, rejected };
}

export interface VerificationReport {
  ok: boolean;
  problems: string[];
  counts: {
    entries: number;
    animes: number;
    episodes: number;
    versions: number;
    watched: number;
    rejected: number;
  };
}

/** Vérifie que chaque entrée valide se retrouve à l'identique (étape 7 de la migration). */
export function verifyLegacyConversion(
  input: { history: Record<string, LegacyEntry> },
  out: LegacyConversion,
): VerificationReport {
  const problems: string[] = [];
  const versions = new Map(out.library.versions.map((v) => [v.id, v]));
  const episodes = new Map(out.library.episodes.map((e) => [e.id, e]));
  const seasons = new Set(out.library.seasons.map((s) => s.id));
  const rejectedKeys = new Set(out.rejected.map((r) => r.key));

  for (const [key, entry] of Object.entries(input.history)) {
    if (rejectedKeys.has(key)) continue;
    const v = versions.get(out.keyMap[key] ?? "");
    if (!v) {
      problems.push(`${key} : version absente`);
      continue;
    }
    const ep = episodes.get(v.episodeId);
    if (!ep || !seasons.has(ep.seasonId))
      problems.push(`${key} : références cassées`);
    if (ep && ep.number !== entry.number)
      problems.push(`${key} : numéro différent`);
    if (v.watched !== (entry.watched === true))
      problems.push(`${key} : statut vu différent`);
    for (const f of [
      "position",
      "duration",
      "updatedAt",
      "openedAt",
    ] as const) {
      if (v[f] !== entry[f]) problems.push(`${key} : ${f} différent`);
    }
  }
  const total = Object.keys(input.history).length;
  if (out.library.versions.length + out.rejected.length !== total)
    problems.push("nombre d’entrées incohérent");

  return {
    ok: problems.length === 0,
    problems,
    counts: {
      entries: total,
      animes: out.library.animes.length,
      episodes: out.library.episodes.length,
      versions: out.library.versions.length,
      watched: out.library.versions.filter((v) => v.watched).length,
      rejected: out.rejected.length,
    },
  };
}
