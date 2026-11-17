// Règles de l'historique (FONCTIONNALITES.md §3) : fonctions pures, sans stockage.

import type { PlaybackVersion } from "../../shared/model";

/** Seuil à partir duquel un épisode est vu. */
export const WATCHED_RATIO = 0.9;

export interface ProgressReport {
  position: number;
  duration: number;
  playing: boolean;
  ended: boolean;
}

/** Ouverture d'une page d'épisode : crée la version si besoin, met à jour la date de consultation. */
export function applyOpened(
  current: PlaybackVersion | undefined,
  base: Pick<PlaybackVersion, "id" | "episodeId" | "language">,
  now: number,
): PlaybackVersion {
  return { ...(current ?? { ...base, watched: false }), openedAt: now };
}

/**
 * Progression du lecteur. Renvoie null si le rapport doit être ignoré :
 * valeurs invalides, ou simple chargement à la position zéro.
 * Un épisode vu reste vu, même après retour en arrière.
 */
export function applyProgress(
  current: PlaybackVersion,
  report: ProgressReport,
  now: number,
): PlaybackVersion | null {
  const { position, duration, playing, ended } = report;
  if (
    ![position, duration].every(Number.isFinite) ||
    duration <= 0 ||
    position < 0
  )
    return null;
  if (!playing && position === 0 && !ended) return null;
  const clamped = Math.min(position, duration);
  return {
    ...current,
    position: clamped,
    duration,
    watched: current.watched || ended || clamped / duration >= WATCHED_RATIO,
    updatedAt: now,
  };
}
