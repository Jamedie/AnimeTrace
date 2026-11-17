// Vues calculées pour l'interface : fonctions pures sur un instantané de la bibliothèque.
// Les pages affichent ce qu'elles reçoivent, sans recalculer (ARCHITECTURE.md §2).

import type { Library, PlaybackVersion } from "../../shared/model";

export type EpisodeStatus = "opened" | "progress" | "watched";

export interface CurrentEpisodeView {
  animeId: string;
  title: string;
  number: number;
  language: string;
  status: EpisodeStatus;
  position?: number;
  duration?: number;
  domain?: string;
}

export interface RecentAnimeView {
  animeId: string;
  title: string;
  lastNumber: number;
  lastLanguage: string;
  lastStatus: EpisodeStatus;
  lastActivity: number;
  watchedCount: number;
  /** Total d'épisodes de la saison ; null tant qu'inconnu (catalogue MAL non associé). */
  total: number | null;
  nextNumber: number;
  /** Adresse la plus récente connue pour cet anime, sert à construire l'épisode suivant. */
  lastUrl?: string;
}

export function versionStatus(v: PlaybackVersion): EpisodeStatus {
  if (v.watched) return "watched";
  return v.updatedAt !== undefined ? "progress" : "opened";
}

interface Indexed {
  versions: Map<string, PlaybackVersion>;
  episodeOf: Map<string, { number: number; seasonId: string }>;
  animeOfSeason: Map<string, string>;
  titles: Map<string, string>;
  urlOfVersion: Map<string, string>;
}

function index(lib: Library): Indexed {
  return {
    versions: new Map(lib.versions.map((v) => [v.id, v])),
    episodeOf: new Map(
      lib.episodes.map((e) => [
        e.id,
        { number: e.number, seasonId: e.seasonId },
      ]),
    ),
    animeOfSeason: new Map(lib.seasons.map((s) => [s.id, s.animeId])),
    titles: new Map(lib.animes.map((a) => [a.id, a.observedTitle])),
    urlOfVersion: new Map(
      lib.sourceRefs
        .filter((r) => r.entity === "version" && r.url)
        .map((r) => [r.entityId, r.url!]),
    ),
  };
}

export function currentEpisodeView(
  lib: Library,
  versionId: string,
): CurrentEpisodeView | null {
  const ix = index(lib);
  const v = ix.versions.get(versionId);
  const ep = v && ix.episodeOf.get(v.episodeId);
  if (!v || !ep) return null;
  const animeId = ix.animeOfSeason.get(ep.seasonId);
  const url = ix.urlOfVersion.get(v.id);
  return {
    animeId: animeId ?? "",
    title: (animeId && ix.titles.get(animeId)) || "?",
    number: ep.number,
    language: v.language,
    status: versionStatus(v),
    ...(v.position !== undefined && { position: v.position }),
    ...(v.duration !== undefined && { duration: v.duration }),
    ...(url && { domain: new URL(url).hostname }),
  };
}

/**
 * « Récemment » : un anime par ligne, trié par dernière lecture réelle.
 * Une simple page ouverte sans lecture n'y apparaît pas. VF et VOSTFR comptent une fois.
 */
export function recentAnimes(lib: Library, limit = 3): RecentAnimeView[] {
  const ix = index(lib);
  const byAnime = new Map<
    string,
    RecentAnimeView & { watchedNumbers: Set<number> }
  >();

  for (const v of lib.versions) {
    if (v.updatedAt === undefined) continue; // pas de lecture réelle
    const ep = ix.episodeOf.get(v.episodeId);
    const animeId = ep && ix.animeOfSeason.get(ep.seasonId);
    if (!ep || !animeId) continue;
    let row = byAnime.get(animeId);
    if (!row) {
      row = {
        animeId,
        title: ix.titles.get(animeId) ?? "?",
        lastNumber: ep.number,
        lastLanguage: v.language,
        lastStatus: versionStatus(v),
        lastActivity: v.updatedAt,
        watchedCount: 0,
        total: null,
        nextNumber: 1,
        watchedNumbers: new Set(),
      };
      byAnime.set(animeId, row);
    }
    if (v.watched) row.watchedNumbers.add(ep.number);
    if (v.updatedAt >= row.lastActivity) {
      Object.assign(row, {
        lastNumber: ep.number,
        lastLanguage: v.language,
        lastStatus: versionStatus(v),
        lastActivity: v.updatedAt,
      });
      const url = ix.urlOfVersion.get(v.id);
      if (url) row.lastUrl = url;
    }
  }

  return [...byAnime.values()]
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .slice(0, limit)
    .map(({ watchedNumbers, ...row }) => ({
      ...row,
      watchedCount: watchedNumbers.size,
      // Épisode en cours : le reprendre ; épisode vu : passer au suivant.
      nextNumber:
        row.lastStatus === "watched" ? row.lastNumber + 1 : row.lastNumber,
    }));
}
