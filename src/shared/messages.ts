// Messages entre les pages de l'extension, les scripts et le service worker.

import type {
  CurrentEpisodeView,
  RecentAnimeView,
} from "../core/history/views";

export interface PopupState {
  catalogEnabled: boolean;
  current: (CurrentEpisodeView & CoverInfo) | null;
  recent: (RecentAnimeView & CoverInfo & { nextUrl: string | null })[];
  /** Lecteurs présents sur la page de l'onglet, mais non autorisés. */
  blockedPlayers: string[];
  /** Lecteurs connus du site, non encore autorisés : demandés en même temps. */
  suggestedPlayers: string[];
  /** Autorisation « webNavigation » accordée : les lecteurs qui redirigent sont détectés. */
  framesVisible: boolean;
}

export interface ProbeResult {
  type: "probe.result";
  host: string;
  site: { id: string; name: string } | null;
  players: string[];
}

export type PageRequest =
  | { type: "popup.state"; tabId: number | null }
  | { type: "library.state" }
  | { type: "domains.list" }
  | {
      type: "domains.activated";
      hosts: { host: string; site: string; kind: "site" | "player" }[];
    };

export type LibraryState =
  import("../core/history/library-view").LibraryView & {
    /** Source de lecture pour la reprise de chaque anime, lorsqu'elle est disponible. */
    resumeUrls: Record<string, string | null>;
  };

/** Demandes de la page Réglages au service worker. */
export type CloudRequest =
  | { type: "cloud.status" }
  | { type: "cloud.configure"; url: string; key: string }
  | { type: "cloud.signIn"; email: string; password: string }
  | { type: "cloud.signOut" }
  | { type: "cloud.sync" }
  | { type: "legacy.close" };

/** Réponse uniforme : le résultat, ou un message d'erreur lisible. */
export type Reply<T> = { ok: true; value: T } | { ok: false; error: string };

/** Demandes liées à MAL (Réglages, bibliothèque). */
export type MalRequest =
  | { type: "mal.status" }
  | { type: "mal.connect" }
  | { type: "mal.disconnect" }
  | { type: "mal.run" }
  | { type: "mal.search"; query: string }
  | { type: "mal.choose"; seasonId: string; malId: number | null }
  | {
      type: "mal.answer";
      malId: number;
      answer: import("../core/sync/operations").MalAnswer;
    };

/** Affiche, total et saison venus du catalogue MAL, quand l'anime est associé. */
export interface CoverInfo {
  picture?: string;
  /** Remplace le total inconnu de la vue de base. */
  total: number | null;
  seasonNumber?: number;
}

/** Sauvegarde (Réglages) : export du fichier, import d'un fichier choisi. */
export type BackupRequest =
  | { type: "backup.export" }
  | { type: "backup.exportLegacy" }
  | { type: "backup.import"; content: string };
