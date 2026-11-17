// Opérations du journal de synchronisation (ARCHITECTURE.md §9).
// Chaque changement local produit une opération, écrite dans la même transaction.

import type { PlaybackVersion } from "../../shared/model";
import type { EpisodeObservation } from "../../connectors/types";
import type { ActivatedDomain } from "../domains/origins";
import type { CatalogLink } from "../catalog/links";

/** Réponses de l'utilisateur sur MAL : épisodes précédents, ou choix en cas de conflit. */
export interface MalAnswer {
  previousAnswer?: boolean;
  /** Garder la valeur MAL : elle devient la référence ; rien n'est renvoyé jusqu'à l'épisode « ignoreUntil ». */
  keepRemote?: { remote: number; ignoreUntil: number };
  /** Renvoyer la progression AnimeTrace : le conflit est levé à partir de la valeur MAL. */
  resend?: { remote: number };
}

export type Operation =
  | {
      id: string;
      deviceId: string;
      createdAt: number;
      type: "episode.opened";
      payload: { observation: EpisodeObservation; versionId: string };
    }
  | {
      id: string;
      deviceId: string;
      createdAt: number;
      type: "version.progress";
      payload: Pick<
        PlaybackVersion,
        "id" | "position" | "duration" | "watched" | "updatedAt"
      >;
    }
  | {
      id: string;
      deviceId: string;
      createdAt: number;
      type: "domain.activated";
      payload: ActivatedDomain;
    }
  | {
      id: string;
      deviceId: string;
      createdAt: number;
      type: "catalog.linked";
      payload: Pick<CatalogLink, "seasonId" | "malId" | "method" | "status">;
    }
  | {
      id: string;
      deviceId: string;
      createdAt: number;
      type: "mal.answer";
      payload: MalAnswer & { malId: number };
    };

type OperationInput = Operation extends infer O
  ? O extends Operation
    ? Omit<O, "id" | "deviceId" | "createdAt">
    : never
  : never;

export function createOperation(
  input: OperationInput,
  deviceId: string,
  now: number,
  id: string = crypto.randomUUID(),
): Operation {
  return { ...input, id, deviceId, createdAt: now } as Operation;
}
