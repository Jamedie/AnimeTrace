// Liste des connecteurs livrés avec l'extension. Ajouter un site = ajouter une ligne ici.

import type { EpisodeObservation, SiteConnector } from "./types";
import { voiranime } from "./voiranime/connector";

export const connectors: SiteConnector[] = [voiranime];

export function findConnector(id: string): SiteConnector | undefined {
  return connectors.find((c) => c.id === id);
}

/** Interroge chaque connecteur ; le premier qui reconnaît la page l'emporte. */
export function observeEpisode(
  doc: Document,
  url: URL,
): EpisodeObservation | null {
  for (const c of connectors) {
    const obs = c.extractEpisode(doc, url);
    if (obs) return obs;
  }
  return null;
}

/** Connecteur dont la structure correspond à la page (activation d'un nouveau domaine). */
export function detectSite(doc: Document, url: URL): SiteConnector | null {
  return connectors.find((c) => c.matchesPage(doc, url)) ?? null;
}
