// Vue de la bibliothèque : anime → saison → épisode → version de lecture.
// Fonction pure ; la page affiche le résultat sans recalcul (PARCOURS-INTERFACE.md §2).

import type { Language, Library } from "../../shared/model";
import {
  indexHistory,
  versionStatus,
  type EpisodeStatus,
  type LatestPlayback,
} from "./views";
import {
  knownTotal,
  type CatalogLink,
  type MalEntry,
  type MalSyncState,
} from "../catalog/links";
import { parseTitle } from "../catalog/match";

const UNPLAYED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface CatalogInput {
  links: CatalogLink[];
  entries: MalEntry[];
  malSync: MalSyncState[];
}

export interface CatalogView {
  status: "none" | "pending" | "confirmed" | "rejected";
  malId?: number;
  title?: string;
  picture?: string;
  candidates: {
    id: number;
    title: string;
    en?: string;
    picture?: string;
    mediaType?: string;
    episodes: number | null;
    season?: string;
  }[];
  question?: { from: number; to: number };
  conflict?: { remote: number; lastSent: number };
  /** Saison de diffusion de la fiche MAL (hiver, printemps, été, automne). */
  airing?: { year: number; season: string };
}

export interface VersionView {
  language: string;
  status: EpisodeStatus;
  position?: number;
  duration?: number;
  /** Dernière activité : lecture, sinon ouverture. */
  at?: number;
  url?: string;
}

export interface EpisodeView {
  number: number;
  /** Vu si au moins une version est vue : VF et VOSTFR comptent une fois. */
  watched: boolean;
  versions: VersionView[];
  url?: string;
}

export interface SeasonView {
  id: string;
  provisional: boolean;
  /** Épisodes du plus récent au plus ancien numéro. */
  episodes: EpisodeView[];
  watchedCount: number;
  total: number | null;
  previousQuestion?: { from: number; to: number };
  confirmedThrough?: number;
}

export interface AnimeCardView {
  id: string;
  title: string;
  seasons: SeasonView[];
  watchedCount: number;
  total: number | null;
  lastActivity: number;
  /** Prochain épisode à regarder : le dernier en cours, sinon le suivant du dernier vu. */
  resume: { number: number; knownUrl?: string } | null;
  lastPlayback?: { number: number; language: Language; position?: number; at?: number };
  status: "in-progress" | "completed";
  /** Numéro de saison lu dans le titre observé, en attendant mieux. */
  seasonNumber: number;
  catalog: CatalogView;
}

export interface LibraryView {
  animes: AnimeCardView[];
  nextExpirationAt?: number;
  totals: {
    animes: number;
    watchedEpisodes: number;
    lastActivity: number | null;
  };
}

export function libraryView(
  lib: Library,
  catalog: CatalogInput = { links: [], entries: [], malSync: [] },
  now = Date.now(),
  history = indexHistory(lib),
  preferences: Record<string, unknown> = {},
): LibraryView {
  const linkOf = new Map(catalog.links.map((l) => [l.seasonId, l]));
  const entryOf = new Map(catalog.entries.map((e) => [e.id, e]));
  const malSyncOf = new Map(catalog.malSync.map((m) => [m.malId, m]));
  const { urlOfVersion, versionsByEpisode, episodesBySeason } = history;
  const resumeFrom = (
    playback: LatestPlayback,
  ): AnimeCardView["resume"] => {
    const { episode, version } = playback;
    const knownUrl = urlOfVersion.get(version.id);
    if (!version.watched)
      return { number: episode.number, ...(knownUrl && { knownUrl }) };

    // Un lien MAL confirmé ne valide ni le périmètre local ni sa numérotation.
    const number = episode.number + 1;
    const next = episodesBySeason.get(episode.seasonId)?.find((e) => e.number === number);
    const sources = next
      ? (versionsByEpisode.get(next.id) ?? []).filter((v) => urlOfVersion.has(v.id))
      : [];
    const preferred = sources.find((v) => v.language === version.language) ?? sources[0];
    if (preferred) return { number, knownUrl: urlOfVersion.get(preferred.id)! };
    return { number };
  };

  const describe = (id: number): CatalogView["candidates"][number] => {
    const e = entryOf.get(id);
    if (!e) return { id, title: `#${id}`, episodes: null };
    return {
      id,
      title: e.title,
      ...(e.alternative_titles?.en && { en: e.alternative_titles.en }),
      ...(e.main_picture?.medium && { picture: e.main_picture.medium }),
      ...(e.media_type && { mediaType: e.media_type }),
      episodes: knownTotal(e),
      ...(e.start_season && {
        season: `${e.start_season.season} ${e.start_season.year}`,
      }),
    };
  };
  const catalogView = (seasonId: string | undefined): CatalogView => {
    const link = seasonId ? linkOf.get(seasonId) : undefined;
    if (!link) return { status: "none", candidates: [] };
    const entry =
      link.malId !== undefined ? entryOf.get(link.malId) : undefined;
    const state =
      link.malId !== undefined ? malSyncOf.get(link.malId) : undefined;
    return {
      status: link.status,
      ...(link.malId !== undefined && { malId: link.malId }),
      ...(entry && { title: entry.alternative_titles?.en || entry.title }),
      ...(entry?.main_picture?.medium && {
        picture: entry.main_picture.medium,
      }),
      ...(link.status === "confirmed" &&
        entry?.start_season && { airing: entry.start_season }),
      candidates: (link.candidates ?? []).map(describe),
      ...(state?.question && { question: state.question }),
      ...(state?.conflict && { conflict: state.conflict }),
    };
  };

  const animes: AnimeCardView[] = [];
  let nextExpirationAt: number | undefined;
  for (const anime of lib.animes) {
    let lastOpenedAt = 0;
    let hasPlayback = false;
    const playback = history.latestPlayback.get(anime.id);

    const seasons: SeasonView[] = lib.seasons
      .filter((s) => s.animeId === anime.id)
      .map((season) => {
        const episodes: EpisodeView[] = (episodesBySeason.get(season.id) ?? [])
          .map((ep) => {
            const versions: VersionView[] = (versionsByEpisode.get(ep.id) ?? [])
              .map((v) => {
                const status = versionStatus(v);
                if (status !== "opened") hasPlayback = true;
                lastOpenedAt = Math.max(lastOpenedAt, v.openedAt ?? 0);
                const at = v.updatedAt ?? v.openedAt;
                const url = urlOfVersion.get(v.id);
                return {
                  language: v.language,
                  status,
                  ...(v.position !== undefined && { position: v.position }),
                  ...(v.duration !== undefined && { duration: v.duration }),
                  ...(at !== undefined && { at }),
                  ...(url && { url }),
                };
              })
              .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
            const watched = history.watchedEpisodes.has(ep.id);
            const latest = versions[0];
            return {
              number: ep.number,
              watched,
              versions,
              ...(latest?.url && { url: latest.url }),
            };
          })
          .sort((a, b) => b.number - a.number);
        const answer = preferences[`library.previous:${season.id}`] as
          | { reviewed: number; confirmed: number }
          | undefined;
        const through = answer?.reviewed ?? 0;
        const confirmedThrough = answer?.confirmed ?? 0;
        const seen = new Set(episodes.filter((e) => e.watched).map((e) => e.number));
        const highest = episodes.find((e) => e.watched)?.number ?? 0;
        let from = confirmedThrough + 1;
        let to = highest - 1;
        while (from <= to && seen.has(from)) from++;
        while (to >= from && seen.has(to)) to--;
        const watchedCount = confirmedThrough + [...seen].filter((n) => n > confirmedThrough).length;
        const link = linkOf.get(season.id);
        const total =
          link?.status === "confirmed" && link.malId !== undefined
            ? knownTotal(entryOf.get(link.malId))
            : null;
        return {
          id: season.id,
          provisional: link?.status !== "confirmed",
          episodes,
          watchedCount,
          total,
          ...(to > through && from <= to && { previousQuestion: { from, to } }),
          ...(confirmedThrough > 0 && { confirmedThrough }),
        };
      });

    const watchedCount = seasons.reduce((n, s) => n + s.watchedCount, 0);
    if (!hasPlayback && watchedCount === 0 && lastOpenedAt > 0) {
      const expiresAt = lastOpenedAt + UNPLAYED_RETENTION_MS;
      if (expiresAt <= now) continue;
      nextExpirationAt = Math.min(nextExpirationAt ?? expiresAt, expiresAt);
    }

    const lastActivity = Math.max(playback?.at ?? 0, lastOpenedAt);
    const hiddenAt = preferences[`library.hidden:${anime.id}`];
    if (watchedCount === 0 && typeof hiddenAt === "number" && lastActivity <= hiddenAt)
      continue;
    const resume = playback ? resumeFrom(playback) : null;
    const lastPlayback = playback && {
      number: playback.episode.number,
      language: playback.version.language,
      ...(playback.at !== undefined && { at: playback.at }),
      ...(playback.version.position !== undefined && { position: playback.version.position }),
    };
    // « Terminé » seulement si le total est connu (catalogue MAL) : jamais déduit sans lui.
    const total = seasons.length === 1 ? seasons[0]!.total : null;
    const status =
      total !== null && watchedCount >= total
        ? ("completed" as const)
        : ("in-progress" as const);
    animes.push({
      id: anime.id,
      title: anime.observedTitle,
      seasons,
      watchedCount,
      total,
      lastActivity,
      resume,
      ...(lastPlayback && { lastPlayback }),
      status,
      seasonNumber: parseTitle(anime.observedTitle).season,
      catalog: catalogView(seasons[0]?.id),
    });
  }

  animes.sort((a, b) => b.lastActivity - a.lastActivity);
  const lastActivity = animes[0]?.lastActivity || null;
  return {
    animes,
    ...(nextExpirationAt !== undefined && { nextExpirationAt }),
    totals: {
      animes: animes.length,
      watchedEpisodes: animes.reduce((n, a) => n + a.watchedCount, 0),
      lastActivity,
    },
  };
}

/** Regroupe les épisodes vus d'affilée pour que la liste commence là où l'on en est. */
export type EpisodeGroup =
  | { kind: "episode"; episode: EpisodeView }
  | { kind: "run"; from: number; to: number; languages: string[] };

export function groupEpisodes(
  episodes: EpisodeView[],
  keepRecent = 3,
): EpisodeGroup[] {
  const out: EpisodeGroup[] = [];
  const sorted = [...episodes].sort((a, b) => b.number - a.number);
  let run: EpisodeView[] = [];
  const flush = () => {
    if (run.length >= 3) {
      const languages = [
        ...new Set(
          run.flatMap((e) =>
            e.versions
              .filter((v) => v.status === "watched")
              .map((v) => v.language),
          ),
        ),
      ];
      out.push({
        kind: "run",
        from: run[run.length - 1]!.number,
        to: run[0]!.number,
        languages,
      });
    } else run.forEach((episode) => out.push({ kind: "episode", episode }));
    run = [];
  };
  sorted.forEach((ep, i) => {
    const consecutive =
      run.length === 0 || run[run.length - 1]!.number === ep.number + 1;
    if (i >= keepRecent && ep.watched && consecutive) run.push(ep);
    else {
      flush();
      if (i >= keepRecent && ep.watched) run.push(ep);
      else out.push({ kind: "episode", episode: ep });
    }
  });
  flush();
  return out;
}

// ── Regroupement par saison de diffusion ────────────────────────────────────

const AIRING_ORDER: Record<string, number> = {
  winter: 0,
  spring: 1,
  summer: 2,
  fall: 3,
};
const AIRING_LABEL: Record<string, string> = {
  winter: "Hiver",
  spring: "Printemps",
  summer: "Été",
  fall: "Automne",
};

export interface AiringGroup {
  /** « Automne 2026 », ou « Saison de diffusion inconnue ». */
  label: string;
  animes: AnimeCardView[];
}

/**
 * Groupes par saison de diffusion MAL, la plus récente d'abord ; dans un groupe,
 * dernière lecture d'abord. Les animes sans fiche confirmée viennent en dernier.
 */
export function groupByAiring(animes: AnimeCardView[]): AiringGroup[] {
  const key = (a: AnimeCardView) => {
    const s = a.catalog.airing;
    return s && s.season in AIRING_ORDER
      ? s.year * 4 + AIRING_ORDER[s.season]!
      : -1;
  };
  const groups = new Map<number, AnimeCardView[]>();
  for (const a of animes) {
    const k = key(a);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([k, list]) => ({
      label:
        k < 0
          ? "Saison de diffusion inconnue"
          : `${AIRING_LABEL[Object.keys(AIRING_ORDER)[k % 4]!]} ${Math.floor(k / 4)}`,
      animes: [...list].sort((x, y) => y.lastActivity - x.lastActivity),
    }));
}
