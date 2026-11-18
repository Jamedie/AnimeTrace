// Fenêtre de l'icône : affiche l'état calculé par le cœur, sans rien recalculer.
// Situations de la maquette V4 : 1 épisode reconnu, 2 nouvelle adresse, 3 lecteur inconnu,
// 4 autorisation refusée, 5 site non pris en charge.

import { browser } from "wxt/browser";
import "../../ui/theme.css";
import "./popup.css";
import {
  button,
  cover,
  formatTime,
  h,
  logo,
  relativeTime,
  statusBadge,
} from "../../ui/components";
import { WATCHED_RATIO } from "../../core/history/playback";
import { originPattern, originsToRequest } from "../../core/domains/origins";
import { findConnector } from "../../connectors";
import type { PopupState, ProbeResult } from "../../shared/messages";

type Grant = { host: string; site: string; kind: "site" | "player" };
type DetectedProbe = ProbeResult & { site: { id: string; name: string } };

function currentCard(c: PopupState["current"] & {}): HTMLElement {
  const card = h(
    "section",
    { class: "now" },
    h(
      "div",
      { class: "now-top" },
      h("span", { class: "lbl" }, "● Suivi sur cette page"),
      c.domain ? h("span", { class: "domain" }, c.domain) : null,
    ),
    h(
      "div",
      { class: "now-main" },
      cover(c.title, c.picture, 54, 76),
      h(
        "div",
        { style: "min-width:0" },
        h("div", { class: "ttl" }, c.title),
        h(
          "div",
          { class: "sub" },
          `${c.seasonNumber ? `Saison ${c.seasonNumber} · ` : ""}Épisode ${c.number} · ${c.language}`,
        ),
        h("div", { class: "badge" }, statusBadge(c.status)),
      ),
    ),
  );
  if (c.position !== undefined && c.duration) {
    const fill = h("i");
    fill.style.width = `${Math.min(100, (c.position / c.duration) * 100)}%`;
    card.append(
      h(
        "div",
        {},
        h("div", { class: "bar" }, fill, h("s")),
        h(
          "div",
          { class: "times" },
          h(
            "span",
            {},
            `${formatTime(c.position)} / ${formatTime(c.duration)}`,
          ),
          h(
            "span",
            {},
            c.status === "watched"
              ? "Vu"
              : `Vu à ${formatTime(c.duration * WATCHED_RATIO)}`,
          ),
        ),
      ),
    );
  }
  return card;
}

function recentRow(r: PopupState["recent"][number]): HTMLElement {
  const meta =
    r.lastStatus === "watched"
      ? `Ép. ${r.lastNumber} vu ${relativeTime(r.lastActivity)}`
      : `Ép. ${r.lastNumber} en cours · ${relativeTime(r.lastActivity)}`;
  const pips = h("div", { class: "pips" });
  // Une puce par épisode vu (10 max), puis le compteur ; total inconnu tant que MAL n'est pas associé.
  for (let i = 0; i < Math.min(r.watchedCount, 10); i++) pips.append(h("b"));
  pips.append(
    h("span", { class: "pc" }, `${r.watchedCount} / ${r.total ?? "?"}`),
  );
  const next = r.nextUrl
    ? h(
        "a",
        { class: "nx", href: r.nextUrl, target: "_blank", rel: "noopener" },
        `Ép. ${r.nextNumber} ›`,
      )
    : null;
  return h(
    "div",
    { class: "r" },
    cover(r.title, r.picture, 36, 50),
    h(
      "div",
      { class: "r-body" },
      h("div", { class: "rt", title: r.title }, r.title),
      h(
        "div",
        { class: "rm" },
        meta + (r.lastLanguage === "VF" ? " · VF" : ""),
      ),
      pips,
    ),
    next,
  );
}

function recentSection(state: PopupState): HTMLElement {
  const catalogLink =
    !state.catalogEnabled && state.recent.some((row) => !row.picture)
      ? button("Activer les affiches", "text", () => {
          void browser.tabs
            .create({ url: browser.runtime.getURL("/settings.html") + "#mal" })
            .then(() => window.close());
        })
      : null;
  return state.recent.length
    ? h(
        "section",
        { class: "rows" },
        h("span", { class: "lbl" }, "Récemment"),
        ...state.recent.map(recentRow),
        catalogLink,
      )
    : h("p", { class: "hint" }, "Regarde un épisode : il apparaîtra ici.");
}

function show(...children: (Node | null)[]) {
  document.getElementById("app")!.replaceChildren(
    h("header", { class: "hd" }, logo()),
    ...children.filter((c): c is Node => !!c),
    h("div", { class: "spacer" }),
    // Bibliothèque, synchronisation et réglages arrivent avec leurs pages.
    h(
      "footer",
      { class: "ft" },
      button(
        "Ma bibliothèque",
        "ghost",
        () =>
          void browser.tabs
            .create({ url: browser.runtime.getURL("/library.html") })
            .then(() => window.close()),
      ),
      h("span", { class: "spacer" }),
      button(
        "Synchroniser",
        "text",
        () => void browser.runtime.sendMessage({ type: "cloud.sync" }),
      ),
      button(
        "Réglages",
        "text",
        () =>
          void browser.tabs
            .create({ url: browser.runtime.getURL("/settings.html") })
            .then(() => window.close()),
      ),
    ),
  );
}

/**
 * Demande à Brave l'accès à des domaines. Appelé directement dans le clic :
 * Brave exige une action de l'utilisateur, sans attente préalable.
 */
async function grant(hosts: Grant[], tabId: number): Promise<boolean> {
  const granted = await browser.permissions.request({
    origins: originsToRequest(hosts.map((d) => d.host)),
  });
  if (!granted) return false;
  await browser.runtime.sendMessage({ type: "domains.activated", hosts });
  // Lance les scripts tout de suite dans la page et ses lecteurs, sans recharger :
  // la vidéo continue là où elle en est.
  await browser.scripting
    .executeScript({ target: { tabId }, files: ["/content-scripts/page.js"] })
    .catch(() => {});
  await browser.scripting
    .executeScript({
      target: { tabId, allFrames: true },
      files: ["/content-scripts/player.js"],
    })
    .catch(() => {});
  return true;
}

// Situation 1, avec la situation 3 si la vidéo passe par un lecteur non autorisé.
function renderTracked(state: PopupState, tabId: number | null) {
  const card = state.current
    ? currentCard(state.current)
    : h("div", { class: "empty" }, "Aucun épisode suivi sur cette page.");
  if (state.current && state.blockedPlayers.length && tabId !== null) {
    const hosts: Grant[] = [
      ...state.blockedPlayers,
      ...state.suggestedPlayers,
    ].map((host) => ({ host, site: "player", kind: "player" }));
    card.append(
      h(
        "div",
        { class: "player-ask" },
        h(
          "p",
          {},
          "La vidéo passe par un lecteur non autorisé : ",
          h("span", { class: "url" }, state.blockedPlayers.join(", ")),
          ". L’autoriser pour suivre la progression ?",
        ),
        state.suggestedPlayers.length
          ? h(
              "p",
              { class: "fine" },
              `Les autres lecteurs connus du site seront autorisés en même temps : ${state.suggestedPlayers.join(", ")}.`,
            )
          : null,
        h(
          "div",
          { class: "btns" },
          button("Autoriser le lecteur", "primary", () => {
            void grant(hosts, tabId).then((ok) => {
              if (ok) window.close();
              else
                renderDenied(state.blockedPlayers[0]!, () =>
                  renderTracked(state, tabId),
                );
            });
          }),
        ),
      ),
    );
  }
  // Lecteur qui redirige (ex. VOE) : invisible sans l'autorisation « webNavigation », demandée ici seulement.
  if (state.current && !state.blockedPlayers.length && !state.framesVisible) {
    card.append(
      h(
        "div",
        { class: "player-ask" },
        h(
          "p",
          { class: "fine" },
          "La progression ne bouge pas ? Certains lecteurs changent d’adresse en cours de route.",
        ),
        h(
          "div",
          { class: "btns" },
          button("Rechercher le lecteur", "ghost", () => {
            void browser.permissions
              .request({ permissions: ["webNavigation"] })
              .then((ok) => {
                if (ok)
                  void getState(tabId).then((s) => renderTracked(s, tabId));
              });
          }),
        ),
      ),
    );
  }
  show(card, recentSection(state));
}

// Situation 2 : nouvelle adresse qui ressemble à un site pris en charge.
function renderActivate(probe: DetectedProbe, tabId: number) {
  const known = findConnector(probe.site.id)?.playerDomains ?? [];
  const players = [...new Set([...probe.players, ...known])];
  const hosts: Grant[] = [
    { host: probe.host, site: probe.site.id, kind: "site" },
    ...players.map(
      (host): Grant => ({ host, site: probe.site.id, kind: "player" }),
    ),
  ];
  show(
    h(
      "section",
      { class: "ask" },
      h("span", { class: "url" }, probe.host),
      h(
        "h3",
        {},
        `Cette adresse ressemble à ${probe.site.name}. Activer le suivi ici ?`,
      ),
      h(
        "p",
        {},
        "Ton historique continue tel quel : les animes déjà vus sont reconnus, sans doublon.",
      ),
      h(
        "div",
        { class: "btns" },
        button("Activer le suivi", "primary", () => {
          void grant(hosts, tabId).then((ok) =>
            ok
              ? window.close()
              : renderDenied(probe.host, () => renderActivate(probe, tabId)),
          );
        }),
        button("Pas maintenant", "text", () => window.close()),
      ),
    ),
    h(
      "div",
      { class: "steps" },
      h("span", { class: "lbl" }, "Ensuite"),
      h(
        "p",
        {},
        h("b", {}, "1 "),
        `Brave demande une fois l’autorisation pour ${probe.host} et ses lecteurs vidéo.`,
      ),
      h(
        "p",
        {},
        h("b", {}, "2 "),
        "Les épisodes s’ouvriront désormais sur cette adresse. L’ancienne reste mémorisée.",
      ),
    ),
  );
}

// Situation 4 : autorisation refusée.
function renderDenied(host: string, retry: () => void) {
  const why = h(
    "p",
    { class: "fine" },
    "AnimeTrace ne lit que les pages d’épisodes et la position de la vidéo, uniquement sur les adresses que tu autorises.",
  );
  why.hidden = true;
  show(
    h(
      "section",
      { class: "ask" },
      h("span", { class: "url" }, host),
      h("h3", {}, "Le suivi n’est pas actif sur cette adresse"),
      h(
        "p",
        {},
        "Brave n’a pas donné l’autorisation. Rien n’est enregistré ici tant qu’elle n’est pas accordée ; ton historique existant n’est pas touché.",
      ),
      h(
        "div",
        { class: "btns" },
        button("Réessayer", "primary", retry),
        button("Pourquoi cette autorisation ?", "text", () => {
          why.hidden = !why.hidden;
        }),
      ),
      why,
    ),
  );
}

// Situation 5 : site non pris en charge.
function renderUnsupported(host: string, state: PopupState) {
  show(
    h(
      "div",
      { class: "empty" },
      h("b", {}, host),
      " n’est pas pris en charge. Rien n’est enregistré ici.",
    ),
    recentSection(state),
  );
}

async function getState(tabId: number | null): Promise<PopupState> {
  const state = (await browser.runtime.sendMessage({
    type: "popup.state",
    tabId,
  })) as PopupState | null;
  if (!state) throw new Error("réponse vide du service worker");
  return state;
}

/** Examine la page de l'onglet actif (autorisation « onglet actif » donnée par le clic sur l'icône). */
function probe(tabId: number): Promise<ProbeResult | null> {
  return new Promise((resolve) => {
    const finish = (result: ProbeResult | null) => {
      clearTimeout(timeout);
      browser.runtime.onMessage.removeListener(onMessage);
      resolve(result);
    };
    const onMessage = (
      message: ProbeResult,
      sender: { tab?: { id?: number } },
    ) => {
      if (message?.type === "probe.result" && sender.tab?.id === tabId)
        finish(message);
    };
    const timeout = setTimeout(() => finish(null), 3000);
    browser.runtime.onMessage.addListener(onMessage);
    browser.scripting
      .executeScript({ target: { tabId }, files: ["/probe.js"] })
      .catch(() => finish(null));
  });
}

async function main() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id ?? null;
  const state = await getState(tabId);
  const url = tab?.url ? new URL(tab.url) : null;

  // Adresse https non autorisée : on examine la page pour proposer l'activation.
  if (
    tabId !== null &&
    url?.protocol === "https:" &&
    !(await browser.permissions.contains({
      origins: [originPattern(url.hostname)],
    }))
  ) {
    const result = await probe(tabId);
    if (result?.site) return renderActivate(result as DetectedProbe, tabId);
    return renderUnsupported(url.hostname, state);
  }

  renderTracked(state, tabId);
  // Mise à jour en direct tant que la fenêtre est ouverte (le lecteur envoie sa position toutes les 5 s).
  const timer = setInterval(() => {
    getState(tabId)
      .then((s) => {
        // On ne remplace pas l'écran si une question d'autorisation est affichée.
        if (!document.querySelector(".ask")) renderTracked(s, tabId);
        else clearInterval(timer);
      })
      .catch(() => {});
  }, 2000);
}

main().catch((error) => {
  document
    .getElementById("app")!
    .replaceChildren(
      h(
        "p",
        { class: "hint" },
        `AnimeTrace n’a pas pu charger ton historique : ${String(error)}`,
      ),
    );
});
