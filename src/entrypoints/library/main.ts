// Bibliothèque : tout l'historique, par anime → saison → épisode → version de lecture.
// Affiche l'état calculé par le cœur (message « library.state »), sans recalcul.

import { browser } from "wxt/browser";
import "../../ui/theme.css";
import "./library.css";
import {
  button,
  cover,
  formatTime,
  h,
  logo,
  relativeTime,
} from "../../ui/components";
import {
  groupByAiring,
  groupEpisodes,
  type AnimeCardView,
  type CatalogView,
  type EpisodeView,
  type VersionView,
} from "../../core/history/library-view";
import type { MalCandidate } from "../../core/catalog/match";
import type { MalAnswer } from "../../core/sync/operations";
import type { LibraryState, MalRequest, Reply } from "../../shared/messages";

type Tab = "in-progress" | "completed" | "to-check" | "all";
type Sort = "airing" | "recent";
/** Tri mémorisé sur cet ordinateur (simple confort : sans stockage, on revient au tri par saison). */
function savedSort(): Sort {
  try {
    return localStorage.getItem("animetrace.sort") === "recent"
      ? "recent"
      : "airing";
  } catch {
    return "airing";
  }
}
const ui = {
  tab: "in-progress" as Tab,
  query: "",
  openAnimeId: null as string | null,
  choosing: false,
  searchResults: null as MalCandidate[] | null,
  expandedRuns: new Set<string>(),
  sort: savedSort(),
};
let state: LibraryState | null = null;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Un point à vérifier : fiche à choisir, question sur les épisodes précédents, conflit MAL. */
function toCheck(a: AnimeCardView): "pending" | "question" | "conflict" | null {
  if (a.catalog.conflict) return "conflict";
  if (a.catalog.question) return "question";
  if (a.catalog.status === "pending") return "pending";
  return null;
}

function visibleAnimes(s: LibraryState): AnimeCardView[] {
  const q = normalize(ui.query.trim());
  return s.animes
    .filter(
      (a) =>
        ui.tab === "all" ||
        (ui.tab === "to-check" ? toCheck(a) !== null : a.status === ui.tab),
    )
    .filter(
      (a) =>
        !q ||
        normalize(a.title).includes(q) ||
        normalize(a.catalog.title ?? "").includes(q),
    );
}

async function mal<T>(request: MalRequest): Promise<T> {
  const reply = (await browser.runtime.sendMessage(request)) as Reply<T> | null;
  if (!reply?.ok)
    throw new Error(reply?.error ?? "Le service worker ne répond pas.");
  return reply.value;
}

const FLAG: Record<"pending" | "question" | "conflict", [string, string]> = {
  pending: ["À confirmer", "pending"],
  question: ["Une question", "question"],
  conflict: ["Conflit MAL", "conflict"],
};

function flag(kind: "pending" | "question" | "conflict"): HTMLElement {
  return h(
    "span",
    { class: "flag", "data-kind": FLAG[kind][1] },
    FLAG[kind][0],
  );
}

function progressBar(a: {
  watchedCount: number;
  total: number | null;
}): HTMLElement {
  const fill = h("i");
  // Total inconnu : barre pointillée, sans remplissage trompeur.
  fill.style.width = a.total
    ? `${Math.min(100, (a.watchedCount / a.total) * 100)}%`
    : "0";
  return h("div", { class: a.total ? "prog known" : "prog" }, fill);
}

function card(a: AnimeCardView, s: LibraryState): HTMLElement {
  const resumeUrl = s.resumeUrls[a.id];
  const check = toCheck(a);
  const overlay = h(
    "div",
    { class: "overlay" },
    resumeUrl && a.resume
      ? h(
          "a",
          { class: "btn", href: resumeUrl, target: "_blank", rel: "noopener" },
          `Reprendre · ép. ${a.resume.number}`,
        )
      : null,
    h("span", { class: "see" }, "Voir la fiche"),
  );
  // Le bouton « Reprendre » ne doit pas ouvrir la fiche en plus.
  overlay
    .querySelector("a")
    ?.addEventListener("click", (e) => e.stopPropagation());
  const el = h(
    "article",
    { class: "card", tabindex: "0", "aria-label": a.title },
    h(
      "div",
      { class: "cover" },
      cover(a.title, a.catalog.picture, 170, 227),
      check ? flag(check) : null,
      overlay,
    ),
    h("div", { class: "ct", title: a.title }, a.title),
    h(
      "div",
      { class: "cm" },
      h(
        "span",
        {},
        a.catalog.status === "confirmed"
          ? `Saison ${a.seasonNumber}`
          : "Saison ?",
      ),
      h("b", {}, `${a.watchedCount} / ${a.total ?? "?"}`),
    ),
    progressBar(a),
  );
  const open = () => openPanel(a.id);
  el.addEventListener("click", open);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") open();
  });
  return el;
}

function checkCards(s: LibraryState): HTMLElement | null {
  const items = s.animes
    .map((a) => [a, toCheck(a)] as const)
    .filter(
      (x): x is readonly [AnimeCardView, "pending" | "question" | "conflict"] =>
        x[1] !== null,
    );
  if (!items.length) return null;
  const describe = (a: AnimeCardView, kind: string) => {
    if (kind === "conflict")
      return `MAL indique ${a.catalog.conflict!.remote}, AnimeTrace ${a.catalog.conflict!.lastSent}. Attend ton choix.`;
    if (kind === "question")
      return `Les épisodes ${a.catalog.question!.from} à ${a.catalog.question!.to} sont-ils déjà vus ?`;
    return a.catalog.candidates.length
      ? `${a.catalog.candidates.length} fiche${a.catalog.candidates.length > 1 ? "s" : ""} possible${a.catalog.candidates.length > 1 ? "s" : ""}.`
      : "Aucune fiche trouvée automatiquement.";
  };
  const action: Record<string, string> = {
    pending: "Choisir",
    question: "Répondre",
    conflict: "Résoudre",
  };
  return h(
    "section",
    { class: "checks" },
    h(
      "div",
      { class: "checks-head" },
      h(
        "span",
        { class: "lbl" },
        `${items.length} point${items.length > 1 ? "s" : ""} à vérifier · tes lectures sont déjà enregistrées`,
      ),
    ),
    h(
      "div",
      { class: "checks-row" },
      ...items.slice(0, 3).map(([a, kind]) => {
        const b = h(
          "button",
          { class: "check", type: "button" },
          cover(a.title, a.catalog.picture, 36, 50),
          h(
            "div",
            { class: "check-body" },
            flag(kind),
            h("b", {}, a.title),
            h("span", {}, describe(a, kind)),
          ),
          h("span", { class: "check-act" }, action[kind]!),
        );
        b.addEventListener("click", () => {
          ui.choosing = kind === "pending";
          openPanel(a.id);
        });
        return b;
      }),
    ),
  );
}

function chip(v: VersionView): HTMLElement {
  const detail =
    v.status === "watched"
      ? `Vu${v.at ? ` · ${new Date(v.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}`
      : v.position !== undefined && v.duration
        ? `${formatTime(v.position)} / ${formatTime(v.duration)}`
        : "Page ouverte";
  return h(
    "span",
    { class: "chip", "data-status": v.status },
    h("b", {}, v.language),
    detail,
  );
}

function episodeRow(ep: EpisodeView): HTMLElement {
  return h(
    "div",
    { class: "ep" },
    h("span", { class: "ep-n" }, String(ep.number)),
    h(
      "div",
      { class: "ep-body" },
      h("div", { class: "ep-t" }, `Épisode ${ep.number}`),
      h("div", { class: "chips" }, ...ep.versions.map(chip)),
    ),
    ep.url
      ? h(
          "a",
          { class: "open", href: ep.url, target: "_blank", rel: "noopener" },
          "Ouvrir",
        )
      : null,
  );
}

function openPanel(animeId: string) {
  ui.openAnimeId = animeId;
  ui.searchResults = null;
  render();
}

function closePanel() {
  ui.openAnimeId = null;
  ui.choosing = false;
  ui.searchResults = null;
  render();
}

/** Écran de choix de la fiche MAL : propositions, recherche libre, « aucune ne correspond ». */
function chooser(a: AnimeCardView): HTMLElement {
  const seasonId = a.seasons[0]?.id;
  const list: CatalogView["candidates"] = ui.searchResults
    ? ui.searchResults.map((c) => ({
        id: c.id,
        title: c.title,
        ...(c.alternative_titles?.en && { en: c.alternative_titles.en }),
        ...(c.main_picture?.medium && { picture: c.main_picture.medium }),
        ...(c.media_type && { mediaType: c.media_type }),
        episodes: c.num_episodes || null,
        ...(c.start_season && {
          season: `${c.start_season.season} ${c.start_season.year}`,
        }),
      }))
    : a.catalog.candidates;
  let selected = a.catalog.malId ?? list[0]?.id ?? null;
  const options = h(
    "div",
    { class: "options" },
    ...list.map((c) => {
      const radio = h("input", {
        type: "radio",
        name: "mal",
        value: String(c.id),
      });
      radio.checked = c.id === selected;
      radio.addEventListener("change", () => {
        selected = c.id;
      });
      return h(
        "label",
        { class: "option" },
        cover(c.en ?? c.title, c.picture, 44, 62),
        h(
          "div",
          {},
          h("b", {}, c.en ?? c.title),
          h(
            "span",
            {},
            [
              c.mediaType?.toUpperCase(),
              c.season,
              c.episodes ? `${c.episodes} épisodes` : "total inconnu",
            ]
              .filter(Boolean)
              .join(" · "),
          ),
          c.en ? h("span", { class: "fine" }, c.title) : null,
        ),
        radio,
      );
    }),
  );
  const query = h("input", {
    type: "search",
    placeholder: "Chercher une autre fiche sur MAL",
    value: a.title,
  });
  const search = h(
    "form",
    { class: "mal-search" },
    query,
    h(
      "button",
      { class: "btn", "data-tone": "ghost", type: "submit" },
      "Chercher",
    ),
  );
  search.addEventListener("submit", (e) => {
    e.preventDefault();
    void mal<MalCandidate[]>({ type: "mal.search", query: query.value }).then(
      (r) => {
        ui.searchResults = r;
        render();
      },
      (err) => alert(String(err)),
    );
  });
  const choose = (malId: number | null) => {
    if (!seasonId) return;
    void mal({ type: "mal.choose", seasonId, malId }).then(
      () => {
        ui.choosing = false;
        void load();
      },
      (err) => alert(String(err)),
    );
  };
  return h(
    "section",
    { class: "chooser" },
    h("h3", {}, "Quelle fiche correspond à ce que tu regardes ?"),
    h(
      "p",
      { class: "fine" },
      "Ton choix est mémorisé. Les lectures sont déjà enregistrées.",
    ),
    list.length
      ? options
      : h(
          "p",
          { class: "fine" },
          "Aucune proposition : cherche la fiche ci-dessous.",
        ),
    search,
    h(
      "div",
      { class: "btns" },
      button(
        "Confirmer",
        "primary",
        list.length
          ? () => {
              if (selected !== null) choose(selected);
            }
          : undefined,
      ),
      button("Aucune ne correspond", "text", () => choose(null)),
      a.catalog.status === "confirmed"
        ? button("Annuler", "text", () => {
            ui.choosing = false;
            render();
          })
        : null,
    ),
  );
}

function answer(malId: number, value: MalAnswer) {
  void mal({ type: "mal.answer", malId, answer: value }).then(
    () => load(),
    (err) => alert(String(err)),
  );
}

function questionBlock(a: AnimeCardView): HTMLElement | null {
  const q = a.catalog.question;
  if (!q || a.catalog.malId === undefined) return null;
  const malId = a.catalog.malId;
  return h(
    "section",
    { class: "ask-box" },
    h("h3", {}, `Les épisodes ${q.from} à ${q.to} sont-ils déjà vus ?`),
    h(
      "p",
      { class: "fine" },
      `Ta liste MAL indique moins d’épisodes que ce que tu regardes. Si tu les as vus ailleurs, MAL passera directement au bon compteur.`,
    ),
    h(
      "div",
      { class: "btns" },
      button("Oui, déjà vus", "primary", () =>
        answer(malId, { previousAnswer: true }),
      ),
      button("Non", "ghost", () => answer(malId, { previousAnswer: false })),
    ),
  );
}

function conflictBlock(a: AnimeCardView): HTMLElement | null {
  const c = a.catalog.conflict;
  if (!c || a.catalog.malId === undefined) return null;
  const malId = a.catalog.malId;
  const highest = Math.max(
    0,
    ...a.seasons.flatMap((s) =>
      s.episodes.filter((e) => e.watched).map((e) => e.number),
    ),
  );
  return h(
    "section",
    { class: "ask-box" },
    h("h3", {}, "Le compteur a baissé sur MAL"),
    h(
      "div",
      { class: "compare" },
      h(
        "div",
        {},
        h("span", { class: "lbl" }, "Sur MAL"),
        h("b", {}, `${c.remote} / ${a.total ?? "?"}`),
      ),
      h(
        "div",
        { class: "mine" },
        h("span", { class: "lbl" }, "AnimeTrace"),
        h("b", {}, `${c.lastSent} / ${a.total ?? "?"}`),
      ),
    ),
    h(
      "div",
      { class: "btns" },
      button(`Renvoyer ${c.lastSent} sur MAL`, "primary", () =>
        answer(malId, { resend: { remote: c.remote } }),
      ),
      button(`Garder ${c.remote}`, "ghost", () =>
        answer(malId, {
          keepRemote: { remote: c.remote, ignoreUntil: highest },
        }),
      ),
    ),
    h(
      "p",
      { class: "fine" },
      `« Garder ${c.remote} » ne supprime rien dans AnimeTrace.`,
    ),
  );
}

function panel(a: AnimeCardView, s: LibraryState): HTMLElement {
  const season = a.seasons[0];
  const list = h("div", { class: "eps" });
  const showChooser = ui.choosing || a.catalog.status === "pending";
  if (showChooser) list.append(chooser(a));
  list.append(
    ...[conflictBlock(a), questionBlock(a)].filter(
      (x): x is HTMLElement => !!x,
    ),
  );
  if (season) {
    for (const g of groupEpisodes(season.episodes)) {
      if (g.kind === "episode") {
        list.append(episodeRow(g.episode));
        continue;
      }
      const key = `${a.id}:${g.from}`;
      if (ui.expandedRuns.has(key)) {
        season.episodes
          .filter((e) => e.number >= g.from && e.number <= g.to)
          .forEach((e) => list.append(episodeRow(e)));
        continue;
      }
      const show = h("button", { type: "button" }, "Afficher");
      show.addEventListener("click", () => {
        ui.expandedRuns.add(key);
        render();
      });
      list.append(
        h(
          "div",
          { class: "run" },
          h("span", { class: "ep-n" }, `${g.from}–${g.to}`),
          `Épisodes ${g.from} à ${g.to} · tous vus${g.languages.length ? ` en ${g.languages.join(" et ")}` : ""}`,
          show,
        ),
      );
    }
  }
  const resumeUrl = s.resumeUrls[a.id];
  const domain = resumeUrl ? new URL(resumeUrl).hostname : null;
  const close = h(
    "button",
    { class: "close", type: "button", "aria-label": "Fermer" },
    "✕",
  );
  close.addEventListener("click", closePanel);
  const backdrop = h("div", { class: "backdrop" });
  backdrop.addEventListener("click", closePanel);

  const change = h("button", { class: "link", type: "button" }, "Changer");
  change.addEventListener("click", () => {
    ui.choosing = true;
    render();
  });
  const meta =
    a.catalog.status === "confirmed"
      ? h(
          "div",
          { class: "meta" },
          a.catalog.title && a.catalog.title !== a.title
            ? `${a.catalog.title} · `
            : "",
          "Fiche MAL associée · ",
          change,
        )
      : a.catalog.status === "rejected"
        ? h("div", { class: "meta" }, "Aucune fiche MAL · ", change)
        : h(
            "div",
            { class: "meta" },
            a.catalog.status === "pending"
              ? "Fiche MAL à confirmer"
              : "Fiche MAL pas encore recherchée",
          );

  return h(
    "div",
    { role: "dialog", "aria-modal": "true", "aria-label": a.title },
    backdrop,
    h(
      "aside",
      { class: "panel" },
      h(
        "div",
        { class: "panel-head" },
        close,
        cover(a.title, a.catalog.picture, 92, 128),
        h("div", {}, h("h2", {}, a.title), meta),
      ),
      h(
        "div",
        { class: "panel-actions" },
        resumeUrl && a.resume
          ? h(
              "a",
              {
                class: "btn",
                href: resumeUrl,
                target: "_blank",
                rel: "noopener",
              },
              `Reprendre · épisode ${a.resume.number}`,
            )
          : null,
        a.catalog.status === "confirmed" && a.catalog.malId !== undefined
          ? h(
              "a",
              {
                class: "btn",
                "data-tone": "ghost",
                href: `https://myanimelist.net/anime/${a.catalog.malId}`,
                target: "_blank",
                rel: "noopener",
              },
              "Voir sur MAL ↗",
            )
          : null,
        domain
          ? h(
              "div",
              { class: "where" },
              "Ouvre la page sur",
              h("b", {}, domain),
            )
          : null,
      ),
      list,
      h(
        "div",
        { class: "panel-foot" },
        h(
          "span",
          {},
          `${a.watchedCount} épisode${a.watchedCount > 1 ? "s" : ""} vu${a.watchedCount > 1 ? "s" : ""}${a.total ? ` sur ${a.total}` : ""} · VF et VOSTFR comptent une fois`,
        ),
        a.lastPlayback
          ? h(
              "span",
              {},
              `Dernière lecture · ép. ${a.lastPlayback.number} · ${a.lastPlayback.language}` +
                (a.lastPlayback.position === undefined
                  ? ""
                  : ` · ${formatTime(a.lastPlayback.position)}`) +
                (a.lastPlayback.at === undefined
                  ? ""
                  : ` · ${relativeTime(a.lastPlayback.at)}`),
            )
          : null,
      ),
    ),
  );
}

function render() {
  const s = state;
  const app = document.getElementById("app")!;
  if (!s) return;
  const count = (t: Tab) =>
    s.animes.filter(
      (a) =>
        t === "all" ||
        (t === "to-check" ? toCheck(a) !== null : a.status === t),
    ).length;

  const tab = (id: Tab, label: string) => {
    const n = count(id);
    const b = h(
      "button",
      {
        class: "tab",
        type: "button",
        role: "tab",
        "aria-selected": String(ui.tab === id),
      },
      label,
      h("span", {}, String(n)),
    );
    if (id === "to-check" && n) b.append(h("i", { class: "dot" }));
    b.addEventListener("click", () => {
      ui.tab = id;
      render();
    });
    return b;
  };

  const search = h("input", {
    type: "search",
    placeholder: "Rechercher un anime",
    "aria-label": "Rechercher un anime",
  });
  search.value = ui.query;
  search.addEventListener("input", () => {
    ui.query = search.value;
    document.querySelector(".grid-slot")?.replaceChildren(gridContent(s));
  });

  const stats = h(
    "div",
    { class: "stats" },
    h("b", {}, String(s.totals.animes)),
    ` anime${s.totals.animes > 1 ? "s" : ""} · `,
    h("b", {}, String(s.totals.watchedEpisodes)),
    ` épisode${s.totals.watchedEpisodes > 1 ? "s" : ""} vu${s.totals.watchedEpisodes > 1 ? "s" : ""}`,
    s.totals.lastActivity
      ? ` · dernière activité ${relativeTime(s.totals.lastActivity)}`
      : "",
  );

  const page = h(
    "div",
    { class: "page" },
    h(
      "header",
      { class: "top" },
      logo(),
      h("label", { class: "search" }, search, h("span", { class: "kbd" }, "/")),
      button("Réglages", "ghost", () => {
        location.href = browser.runtime.getURL("/settings.html");
      }),
    ),
    h("div", { class: "title-row" }, h("h1", {}, "Ma bibliothèque"), stats),
    checkCards(s),
    h(
      "div",
      { class: "tabs-row" },
      h(
        "div",
        { class: "tabs", role: "tablist" },
        tab("in-progress", "En cours"),
        tab("completed", "Terminés"),
        tab("to-check", "À confirmer"),
        tab("all", "Tous"),
      ),
      sortSelect(),
    ),
    h("div", { class: "grid-slot" }, gridContent(s)),
    s.animes.length
      ? h(
          "div",
          { class: "notes" },
          h(
            "span",
            {},
            "Survol : Reprendre ouvre l’épisode suivant sur l’adresse la plus récente du site.",
          ),
          h("span", {}, "« ? » : total inconnu, jamais affiché comme terminé."),
        )
      : null,
  );

  const open = ui.openAnimeId
    ? s.animes.find((a) => a.id === ui.openAnimeId)
    : undefined;
  app.replaceChildren(page, ...(open ? [panel(open, s)] : []));
  if (document.activeElement === document.body && ui.query) search.focus();
}

function gridContent(s: LibraryState): HTMLElement {
  const list = visibleAnimes(s);
  if (!s.animes.length)
    return h(
      "div",
      { class: "empty-lib" },
      "Ta bibliothèque est vide.",
      h("br"),
      "Regarde un épisode sur un site pris en charge : il apparaîtra ici automatiquement.",
    );
  if (!list.length)
    return h(
      "div",
      { class: "empty-lib" },
      ui.query
        ? "Aucun anime ne correspond à ta recherche."
        : "Rien ici pour le moment.",
    );
  if (ui.sort === "recent")
    return h("div", { class: "grid" }, ...list.map((a) => card(a, s)));
  return h(
    "div",
    { class: "airing" },
    ...groupByAiring(list).map((g) =>
      h(
        "section",
        {},
        h(
          "h2",
          { class: "airing-title" },
          g.label,
          h("span", {}, String(g.animes.length)),
        ),
        h("div", { class: "grid" }, ...g.animes.map((a) => card(a, s))),
      ),
    ),
  );
}

function sortSelect(): HTMLElement {
  const select = h(
    "select",
    { "aria-label": "Trier" },
    h("option", { value: "airing" }, "Par saison de diffusion"),
    h("option", { value: "recent" }, "Par dernière lecture"),
  );
  select.value = ui.sort;
  select.addEventListener("change", () => {
    ui.sort = select.value === "recent" ? "recent" : "airing";
    try {
      localStorage.setItem("animetrace.sort", ui.sort);
    } catch {
      /* stockage indisponible */
    }
    render();
  });
  return h("label", { class: "sort" }, "Trier", select);
}

let expirationTimer: ReturnType<typeof setTimeout> | undefined;

function refreshAfterExpiration(delay: number) {
  clearTimeout(expirationTimer);
  expirationTimer = setTimeout(() => {
    if (document.hidden) return;
    if (ui.openAnimeId) {
      refreshAfterExpiration(60_000);
      return;
    }
    void load().catch(() => refreshAfterExpiration(60_000));
  }, Math.min(delay, 2_147_483_647));
}

async function load() {
  const next = (await browser.runtime.sendMessage({
    type: "library.state",
  })) as LibraryState | null;
  if (!next) throw new Error("réponse vide du service worker");
  state = next;
  clearTimeout(expirationTimer);
  if (next.nextExpirationAt !== undefined)
    refreshAfterExpiration(Math.max(0, next.nextExpirationAt - Date.now()));
  render();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ui.openAnimeId) closePanel();
  if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
    e.preventDefault();
    document.querySelector<HTMLInputElement>(".search input")?.focus();
  }
});
// Revenir sur l'onglet après avoir regardé un épisode : la bibliothèque se met à jour.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !ui.choosing) void load().catch(() => {});
});

load().catch((error) => {
  document
    .getElementById("app")!
    .replaceChildren(
      h(
        "p",
        { class: "empty-lib" },
        `AnimeTrace n’a pas pu charger ta bibliothèque : ${String(error)}`,
      ),
    );
});
