// Contrat commun des connecteurs de sites (ARCHITECTURE.md §4).
// Un connecteur lit une page et renvoie des informations normalisées.
// Il ne touche jamais au stockage, au réseau, ni au statut vu.

import type { Language } from "../shared/model";

/** Ce qu'un connecteur a observé sur une page d'épisode. */
export interface EpisodeObservation {
  /** Identifiant du site logique, ex. « voiranime ». */
  site: string;
  /** Identifiant du contenu sur le site (ex. slug), stable d'un domaine à l'autre. */
  contentKey: string;
  title: string;
  number: number;
  language: Language;
  url: string;
}

export interface SiteConnector {
  id: string;
  name: string;
  /** Domaines livrés avec l'extension ; l'utilisateur peut en activer d'autres. */
  knownDomains: string[];
  /** Domaines de lecteurs vidéo connus pour ce site. */
  playerDomains: string[];
  /** La page a-t-elle la structure de ce site ? (activation d'un nouveau domaine) */
  matchesPage(doc: Document, url: URL): boolean;
  /** Épisode affiché, ou null si la page n'est pas une page d'épisode. */
  extractEpisode(doc: Document, url: URL): EpisodeObservation | null;
  /** Adresse d'un autre épisode, déduite d'une adresse d'épisode connue ; null si impossible. */
  episodeUrl(knownEpisodeUrl: string, number: number): string | null;
}
