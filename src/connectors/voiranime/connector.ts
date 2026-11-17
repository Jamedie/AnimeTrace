// Connecteur Voiranime. Reprend la détection de la 0.3.6 sans dépendre du domaine.
// Forme d'une page d'épisode : /anime/<slug>/<slug-épisode>-<numéro>-<vostfr|vf>/

import type { EpisodeObservation, SiteConnector } from "../types";

const EPISODE_PATH = /^\/anime\/([^/]+)\/([^/]+)-(\d+)-(vostfr|vf)\/?$/i;
const ANY_ANIME_PATH = /^\/anime\/[^/]+\/?/i;

export const voiranime: SiteConnector = {
  id: "voiranime",
  name: "Voiranime",
  knownDomains: ["voiranime.cx"],
  // Lecteurs relevés le 17/11/2026 (myTV, MOON, VOE, Stape, FHD1). Ces domaines changent :
  // les nouveaux sont proposés à l'autorisation depuis la fenêtre de l'icône.
  playerDomains: [
    "voembed.net",
    "vidmoly.me",
    "vidmoly.net",
    "mfw09.org",
    "voe.sx",
    "streamtape.com",
    "my.mail.ru",
  ],

  matchesPage(doc, url) {
    // Une page d'épisode reconnue, ou une page d'anime avec des liens d'épisodes au même format.
    if (this.extractEpisode(doc, url)) return true;
    if (!ANY_ANIME_PATH.test(url.pathname)) return false;
    return Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href]")).some(
      (a) => {
        try {
          const link = new URL(a.getAttribute("href") ?? "", url);
          return link.host === url.host && EPISODE_PATH.test(link.pathname);
        } catch {
          return false;
        }
      },
    );
  },

  episodeUrl(known, number) {
    const url = new URL(known);
    const match = url.pathname.match(EPISODE_PATH);
    if (!match) return null;
    const [, slug, episodeSlug, num, lang] = match;
    // Garde le même nombre de chiffres que l'adresse connue (« 03 » → « 04 »).
    const padded = String(number).padStart(num!.length, "0");
    url.pathname = `/anime/${slug}/${episodeSlug}-${padded}-${lang}/`;
    return url.href;
  },

  extractEpisode(doc, url): EpisodeObservation | null {
    const match = url.pathname.match(EPISODE_PATH);
    if (!match) return null;
    const [, slug, , num, lang] = match;
    // Le titre lisible est le lien vers la fiche de l'anime ; à défaut, le slug.
    const titleLink = doc.querySelector<HTMLAnchorElement>(
      `a[href="${url.origin}/anime/${slug}/"], a[href="/anime/${slug}/"]`,
    );
    return {
      site: "voiranime",
      contentKey: slug!,
      title: titleLink?.textContent?.trim() || slug!,
      number: Number(num),
      language: lang!.toUpperCase() as EpisodeObservation["language"],
      url: url.href,
    };
  },
};
