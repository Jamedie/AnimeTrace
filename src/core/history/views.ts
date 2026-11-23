// Vues calculées pour l'interface : fonctions pures sur un instantané de la bibliothèque.
// Les pages affichent ce qu'elles reçoivent, sans recalculer (ARCHITECTURE.md §2).

import type { Episode, Library, PlaybackVersion } from "../../shared/model";

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
  lastPosition?: number;
  /** Source de la dernière version lue. */
  lastUrl?: string;
}

export function versionStatus(v: PlaybackVersion): EpisodeStatus {
  if (v.watched) return "watched";
  return v.updatedAt !== undefined || (v.position ?? 0) > 0 ? "progress" : "opened";
}

export interface LatestPlayback {
  episode: Episode;
  version: PlaybackVersion;
  at: number;
}

export function indexHistory(lib: Library) {
  const versions = new Map(lib.versions.map((v) => [v.id, v]));
  const episodeOf = new Map(lib.episodes.map((e) => [e.id, e]));
  const animeOfSeason = new Map(lib.seasons.map((s) => [s.id, s.animeId]));
  const titles = new Map(lib.animes.map((a) => [a.id, a.observedTitle]));
  const urlOfVersion = new Map<string, string>();
  for (const ref of lib.sourceRefs) {
    if (
      ref.entity === "version" &&
      ref.url &&
      URL.canParse(ref.url) &&
      new URL(ref.url).protocol === "https:"
    )
      urlOfVersion.set(ref.entityId, ref.url);
  }
  const versionsByEpisode = new Map<string, PlaybackVersion[]>();
  const episodesBySeason = new Map<string, Episode[]>();
  const watchedEpisodes = new Set<string>();
  const latestPlayback = new Map<string, LatestPlayback>();
  for (const episode of lib.episodes) {
    const group = episodesBySeason.get(episode.seasonId) ?? [];
    group.push(episode);
    episodesBySeason.set(episode.seasonId, group);
  }
  for (const version of lib.versions) {
    const group = versionsByEpisode.get(version.episodeId) ?? [];
    group.push(version);
    versionsByEpisode.set(version.episodeId, group);
    const episode = episodeOf.get(version.episodeId);
    if (!episode) continue;
    if (version.watched) watchedEpisodes.add(episode.id);
    const animeId = animeOfSeason.get(episode.seasonId);
    const at = version.updatedAt;
    if (!animeId || at === undefined) continue;
    const previous = latestPlayback.get(animeId);
    if (!previous || previous.at <= at)
      latestPlayback.set(animeId, { episode, version, at });
  }
  const watchedByAnime = new Map<string, number>();
  for (const episodeId of watchedEpisodes) {
    const animeId = animeOfSeason.get(episodeOf.get(episodeId)!.seasonId);
    if (animeId)
      watchedByAnime.set(animeId, (watchedByAnime.get(animeId) ?? 0) + 1);
  }
  return {
    versions,
    episodeOf,
    animeOfSeason,
    titles,
    urlOfVersion,
    versionsByEpisode,
    episodesBySeason,
    watchedEpisodes,
    latestPlayback,
    watchedByAnime,
  };
}

export function currentEpisodeView(
  lib: Library,
  versionId: string,
  ix = indexHistory(lib),
): CurrentEpisodeView | null {
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
export function recentAnimes(
  lib: Library,
  limit = 3,
  ix = indexHistory(lib),
): RecentAnimeView[] {
  return [...ix.latestPlayback]
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, limit)
    .map(([animeId, { episode, version, at }]) => {
      const url = ix.urlOfVersion.get(version.id);
      return {
        animeId,
        title: ix.titles.get(animeId) ?? "?",
        lastNumber: episode.number,
        lastLanguage: version.language,
        lastStatus: versionStatus(version),
        lastActivity: at,
        watchedCount: ix.watchedByAnime.get(animeId) ?? 0,
        total: null,
        nextNumber: version.watched ? episode.number + 1 : episode.number,
        ...(version.position !== undefined && { lastPosition: version.position }),
        ...(url && { lastUrl: url }),
      };
    });
}
