// Identifiants internes déterministes à partir du site logique et des clés de contenu.
// Ne dépendent jamais du domaine : un même contenu sur une nouvelle adresse garde ses identifiants.
// Les identifiants restent stables entre appareils et avec les lectures déjà enregistrées.

import type { Language } from "../../shared/model";
import { uuidV5 } from "../backup/deterministic-id";

export interface ContentIds {
  animeId: string;
  seasonId: string;
  episodeId: string;
  versionId: string;
  /** Clé de version au format 0.3.6 : slug:numéro:langue. */
  versionKey: string;
}

export async function contentIds(
  site: string,
  contentKey: string,
  number: number,
  language: Language,
): Promise<ContentIds> {
  const versionKey = `${contentKey}:${number}:${language.toLowerCase()}`;
  return {
    animeId: await uuidV5(`${site}:anime:${contentKey}`),
    seasonId: await uuidV5(`${site}:season:${contentKey}`),
    episodeId: await uuidV5(`${site}:episode:${contentKey}:${number}`),
    versionId: await uuidV5(`${site}:version:${versionKey}`),
    versionKey,
  };
}
