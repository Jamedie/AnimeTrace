// Rapprochement d'un anime vu sur un site avec une fiche MAL (MODELE-DONNEES.md §3).
// Règles validées : ne jamais prendre le premier résultat par défaut, vérifier la saison et le format,
// laisser en attente dès qu'un doute subsiste. Fonctions pures.

export interface MalCandidate {
  id: number;
  title: string;
  alternative_titles?: { en?: string; ja?: string; synonyms?: string[] };
  media_type?: string;
  num_episodes?: number;
  start_season?: { year: number; season: string };
  main_picture?: { medium?: string; large?: string };
}

export interface ParsedTitle {
  base: string;
  season: number;
}

const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
};
const ROMAN: Record<string, number> = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Sépare le titre de son numéro de saison :
 * « Season 2 », « 2nd Season », « Saison 2 », « II », un nombre final (« Youjo Senki 2 »).
 * Un sous-titre après « : » est ignoré quand il suit un numéro de saison (« Clevatess II: … »).
 */
export function parseTitle(raw: string): ParsedTitle {
  let s = raw;
  const colon = s.match(/^(.*?\s(?:ii|iii|iv|v|vi|\d{1,2}))\s*:/i);
  if (colon) s = colon[1]!;
  let words = normalize(s).split(" ").filter(Boolean);
  let season = 1;

  const take = (n: number, value: number) => {
    words = words.slice(0, words.length - n);
    season = value;
  };
  const last = () => words[words.length - 1] ?? "";
  const prev = () => words[words.length - 2] ?? "";

  if (/^(season|saison|part)$/.test(prev()) && /^\d{1,2}$/.test(last()))
    take(2, Number(last()));
  else if (last() === "season" && /^(\d{1,2})(st|nd|rd|th)$/.test(prev()))
    take(2, parseInt(prev(), 10));
  else if (last() === "season" && ORDINALS[prev()]) take(2, ORDINALS[prev()]!);
  else if (ROMAN[last()] && words.length > 1) take(1, ROMAN[last()]!);
  else if (
    /^\d{1,2}$/.test(last()) &&
    words.length > 1 &&
    !/^(no|n)$/.test(prev())
  )
    take(1, Number(last()));
  // « Kaiju No. 8 » : le numéro fait partie du titre, pas de la saison.

  return { base: words.join(" "), season };
}

function names(c: MalCandidate): string[] {
  return [
    c.title,
    c.alternative_titles?.en,
    ...(c.alternative_titles?.synonyms ?? []),
  ].filter((n): n is string => !!n);
}

/** La fiche correspond-elle exactement au titre et à la saison observés ? */
export function isExactMatch(observed: ParsedTitle, c: MalCandidate): boolean {
  return names(c).some((n) => {
    const p = parseTitle(n);
    return p.base === observed.base && p.season === observed.season;
  });
}

const SERIES_TYPES = new Set(["tv", "ona", "ova", "tv_special"]);

export type MatchResult =
  | { status: "confirmed"; malId: number; method: "auto" }
  | { status: "pending"; candidates: number[] };

/**
 * Décide d'une association à partir des titres observés (titre affiché, identifiant du site).
 * Automatique uniquement si une seule fiche de série correspond exactement ; sinon en attente,
 * avec les fiches les plus plausibles proposées à l'utilisateur.
 */
export function matchCandidates(
  observedTitles: string[],
  candidates: MalCandidate[],
): MatchResult {
  const parsed = observedTitles.map(parseTitle);
  const exact = candidates.filter((c) =>
    parsed.some((p) => isExactMatch(p, c)),
  );
  const series = exact.filter(
    (c) => !c.media_type || SERIES_TYPES.has(c.media_type),
  );
  const unique = [...new Map(series.map((c) => [c.id, c])).values()];
  if (unique.length === 1)
    return { status: "confirmed", malId: unique[0]!.id, method: "auto" };

  // Propositions : correspondances exactes d'abord, puis même titre de base (autre saison), puis le reste.
  const sameBase = candidates.filter((c) =>
    names(c).some((n) => parsed.some((p) => parseTitle(n).base === p.base)),
  );
  const ordered = [
    ...new Set([...exact, ...sameBase, ...candidates].map((c) => c.id)),
  ];
  return { status: "pending", candidates: ordered.slice(0, 5) };
}

/** Le slug « a-wild-last-boss-appeared-2 » devient un titre cherchable. */
export function slugToTitle(slug: string): string {
  return slug.replace(/-/g, " ");
}
