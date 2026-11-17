// Associations entre une saison interne et une fiche MAL (MODELE-DONNEES.md §3).

import type { MalCandidate } from "./match";

export interface CatalogLink {
  seasonId: string;
  status: "pending" | "confirmed" | "rejected";
  malId?: number;
  /** auto : rapprochement automatique ; user : choix de l'utilisateur. */
  method?: "auto" | "user";
  /** Fiches proposées tant que l'association est en attente. */
  candidates?: number[];
  at: number;
}

/** Métadonnées de catalogue mises en cache, séparées des données personnelles. */
export type MalEntry = MalCandidate & { fetchedAt: number };

/** État de synchronisation de la liste MAL, par fiche. */
export interface MalSyncState {
  malId: number;
  lastSent?: number;
  previousAnswer?: boolean;
  question?: { from: number; to: number };
  conflict?: { remote: number; lastSent: number };
  /** « Garder la valeur MAL » : rien n'est renvoyé tant qu'aucun épisode au-delà n'est vu. */
  ignoreUntil?: number;
  lastError?: string;
  updatedAt: number;
}

/** Total d'épisodes : 0 sur MAL signifie « inconnu », jamais « vide ». */
export function knownTotal(
  entry: Pick<MalCandidate, "num_episodes"> | undefined,
): number | null {
  return entry?.num_episodes ? entry.num_episodes : null;
}
