// Domaines activés et autorisations (FONCTIONNALITES.md §4, ARCHITECTURE.md §5). Fonctions pures.

export interface ActivatedDomain {
  host: string;
  /** Site logique (connecteur) ou « player » pour un lecteur vidéo. */
  site: string;
  kind: "site" | "player";
  activatedAt: number;
}

/** Motif d'autorisation pour un hôte : https uniquement. */
export function originPattern(host: string): string {
  return `https://${host}/*`;
}

/** Hôtes https distincts parmi des adresses (iframes de lecteurs), sans l'hôte de la page. */
export function playerHosts(srcs: string[], pageHost: string): string[] {
  const hosts = new Set<string>();
  for (const src of srcs) {
    try {
      const url = new URL(src);
      if (url.protocol === "https:" && url.hostname !== pageHost)
        hosts.add(url.hostname);
    } catch {
      // adresse invalide ou about:blank : ignorée
    }
  }
  return [...hosts].sort();
}

/** Origines à demander en une fois : le domaine de la page (si besoin) et les lecteurs. */
export function originsToRequest(hosts: string[]): string[] {
  return [...new Set(hosts)].map(originPattern);
}

/**
 * Lecteurs qui redirigent (VOE : voe.sx/e/abc → autre-adresse.com/e/abc) :
 * un cadre réellement chargé dont le chemin est celui d'un lecteur de la page, sur un autre domaine.
 * Le chemin identique évite de confondre avec des cadres publicitaires.
 */
export function redirectedPlayerHosts(
  frameUrls: string[],
  playerSrcs: string[],
  pageHost: string,
): string[] {
  const paths = new Map<string, string>();
  for (const src of playerSrcs) {
    try {
      const u = new URL(src);
      if (u.pathname.length > 1) paths.set(u.pathname, u.hostname);
    } catch {
      /* ignorée */
    }
  }
  const hosts = new Set<string>();
  for (const f of frameUrls) {
    try {
      const u = new URL(f);
      const origin = paths.get(u.pathname);
      if (
        u.protocol === "https:" &&
        origin &&
        origin !== u.hostname &&
        u.hostname !== pageHost
      )
        hosts.add(u.hostname);
    } catch {
      /* ignorée */
    }
  }
  return [...hosts].sort();
}
