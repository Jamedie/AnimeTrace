// Règles de fusion entre ordinateurs (ARCHITECTURE.md §9). Fonctions pures, identiques partout :
// tous les ordinateurs qui appliquent les mêmes opérations obtiennent le même résultat.

import type { PlaybackVersion } from "../../shared/model";

type ProgressFields = Pick<
  PlaybackVersion,
  "watched" | "position" | "duration" | "updatedAt"
>;

/**
 * Applique une progression venue du serveur.
 * - un épisode vu reste vu ;
 * - la position retenue est la plus récente selon l'ordre du serveur (revision),
 *   jamais selon l'horloge des ordinateurs ;
 * - réappliquer une opération déjà vue ne change rien.
 */
export function mergeRemoteProgress(
  local: PlaybackVersion,
  incoming: ProgressFields,
  revision: number,
): PlaybackVersion {
  const merged: PlaybackVersion = {
    ...local,
    watched: local.watched || incoming.watched === true,
  };
  if (revision > (local.syncRevision ?? -1)) {
    for (const f of ["position", "duration", "updatedAt"] as const) {
      if (incoming[f] !== undefined) merged[f] = incoming[f];
    }
    merged.syncRevision = revision;
  }
  return merged;
}

/**
 * Fusionne une version importée sans ordre serveur (historique cloud 0.3.6, sauvegarde) :
 * vu cumulatif, progression la plus récente selon sa date, première ouverture la plus récente.
 */
export function mergeImportedVersion(
  local: PlaybackVersion | undefined,
  incoming: PlaybackVersion,
): PlaybackVersion {
  if (!local) return incoming;
  const merged: PlaybackVersion = {
    ...local,
    watched: local.watched || incoming.watched,
  };
  if ((incoming.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
    for (const f of ["position", "duration", "updatedAt"] as const) {
      if (incoming[f] !== undefined) merged[f] = incoming[f];
    }
  }
  const opened = Math.max(local.openedAt ?? 0, incoming.openedAt ?? 0);
  if (opened) merged.openedAt = opened;
  return merged;
}

/** Date d'ouverture : la plus récente des deux. */
export function mergeOpenedAt(
  local: PlaybackVersion,
  openedAt: number,
): PlaybackVersion {
  return { ...local, openedAt: Math.max(local.openedAt ?? 0, openedAt) };
}
