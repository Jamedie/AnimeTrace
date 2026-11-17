// Modèle de données V1 (MODELE-DONNEES.md).
// Hiérarchie : anime → saison → épisode → version de lecture.
// Les identifiants internes sont immuables et indépendants des adresses de sites.

export type Language = "VF" | "VOSTFR";

export interface Anime {
  id: string;
  /** Titre observé sur le site, conservé tel quel. */
  observedTitle: string;
}

export interface Season {
  id: string;
  animeId: string;
  /** Provisoire tant qu'aucune fiche MAL n'est confirmée. */
  provisional: boolean;
}

export interface Episode {
  id: string;
  seasonId: string;
  number: number;
}

export interface PlaybackVersion {
  id: string;
  episodeId: string;
  language: Language;
  watched: boolean;
  /** Champs absents de la source : restent absents. */
  position?: number;
  duration?: number;
  updatedAt?: number;
  openedAt?: number;
  /** Numéro serveur de la dernière progression appliquée : ordre commun entre ordinateurs. */
  syncRevision?: number;
}

/** Correspondance entre un contenu d'un site et une entité interne. */
export interface SourceRef {
  site: string;
  /** Identifiant du contenu sur le site (ex. slug Voiranime). */
  contentKey: string;
  entity: "anime" | "version";
  entityId: string;
  url?: string;
  /** Ancienne affiche, conservée avec sa provenance. */
  thumbnail?: string;
  /** Numéro serveur de la dernière adresse appliquée. */
  revision?: number;
}

export interface Library {
  schemaVersion: 1;
  animes: Anime[];
  seasons: Season[];
  episodes: Episode[];
  versions: PlaybackVersion[];
  sourceRefs: SourceRef[];
}
