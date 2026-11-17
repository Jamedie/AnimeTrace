// Composants partagés entre les pages (repris des composants du canevas Doop).
// Fonctions qui renvoient du DOM : aucun framework, aucun HTML injecté depuis des données.

import type { EpisodeStatus } from "../core/history/views";

type Child = Node | string | null | undefined | false;

/** Crée un élément ; les textes sont toujours insérés comme texte, jamais comme HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

const LOGO_SVG = `<svg class="lg-m" viewBox="0 0 512 512" aria-hidden="true"><rect x="40" y="56" width="432" height="400" rx="96" fill="#f4b400"/><rect x="88" y="108" width="336" height="272" rx="56" fill="#211c29"/><ellipse cx="196" cy="236" rx="36" ry="46" fill="#fffaf1"/><ellipse cx="316" cy="236" rx="36" ry="46" fill="#fffaf1"/><circle cx="208" cy="220" r="13" fill="#211c29"/><circle cx="328" cy="220" r="13" fill="#211c29"/><path d="M226 310q30 26 60 0" stroke="#fffaf1" stroke-width="18" fill="none" stroke-linecap="round"/><rect x="176" y="404" width="160" height="20" rx="10" fill="#d97706"/><rect x="176" y="404" width="112" height="20" rx="10" fill="#211c29"/><path d="M430 18C437 62 446 72 492 80C446 88 437 98 430 142C423 98 414 88 368 80C414 72 423 62 430 18Z" fill="#fffaf1" stroke="#211c29" stroke-width="14" paint-order="stroke"/></svg>`;

export function logo(): HTMLElement {
  const el = h("span", { class: "lg" });
  el.innerHTML = LOGO_SVG; // constante interne, aucune donnée utilisateur
  el.append(h("span", { class: "lg-t" }, "AnimeTrace"));
  return el;
}

const STATUS_LABEL: Record<EpisodeStatus, string> = {
  opened: "Page ouverte",
  progress: "En cours",
  watched: "Vu",
};

export function statusBadge(status: EpisodeStatus): HTMLElement {
  return h(
    "span",
    { class: "sb", "data-status": status },
    h("i", { class: "sb-dot" }),
    STATUS_LABEL[status],
  );
}

export function button(
  label: string,
  tone: "primary" | "ghost" | "text" = "primary",
  onClick?: () => void,
): HTMLButtonElement {
  const b = h(
    "button",
    { class: "btn", "data-tone": tone, type: "button" },
    label,
  );
  if (onClick) b.addEventListener("click", onClick);
  else b.disabled = true;
  return b;
}

/**
 * Visuel de remplacement tant qu'aucune affiche MAL n'est associée :
 * un dégradé stable calculé à partir du titre.
 */
export function placeholderCover(
  title: string,
  width: number,
  height: number,
): HTMLElement {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const el = h("div", { class: "th" });
  el.style.cssText = `width:${width}px;height:${height}px;background:linear-gradient(160deg,hsl(${hue} 55% 22%),hsl(${(hue + 40) % 360} 60% 45%) 60%,hsl(${(hue + 80) % 360} 75% 70%))`;
  return el;
}

/** 14:02 */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

/** « il y a 3 jours », « hier », « à l'instant » */
export function relativeTime(at: number, now = Date.now()): string {
  const min = Math.round((now - at) / 60000);
  if (min < 1) return "à l’instant";
  if (min < 60) return `il y a ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}

/** Affiche MAL si connue, sinon visuel de remplacement. */
export function cover(
  title: string,
  picture: string | undefined,
  width: number,
  height: number,
): HTMLElement {
  if (!picture) return placeholderCover(title, width, height);
  const img = h("img", {
    class: "th",
    src: picture,
    alt: "",
    loading: "lazy",
    referrerpolicy: "no-referrer",
  });
  img.style.cssText = `width:${width}px;height:${height}px;object-fit:cover`;
  // Image indisponible : on revient au visuel de remplacement.
  img.addEventListener(
    "error",
    () => img.replaceWith(placeholderCover(title, width, height)),
    { once: true },
  );
  return img;
}
