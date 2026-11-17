// Script de page : demande aux connecteurs quel épisode est affiché et prévient le cœur.
// Signale aussi les lecteurs vidéo présents (iframes), pour proposer leur autorisation.
// Enregistré dynamiquement par le service worker sur les domaines autorisés.
import { browser } from "wxt/browser";
import { observeEpisode } from "../connectors";
import { playerHosts } from "../core/domains/origins";

export default defineContentScript({
  matches: ["https://voiranime.cx/*"],
  registration: "runtime",
  runAt: "document_idle",
  main() {
    const w = window as unknown as { __animetracePage?: boolean };
    if (w.__animetracePage) return;
    w.__animetracePage = true;
    const observation = observeEpisode(document, new URL(location.href));
    if (!observation) return;
    browser.runtime
      .sendMessage({ type: "episode", observation })
      .catch(() => {});

    // Le changement de lecteur (myTV, MOON, VOE…) remplace l'iframe : on suit ces changements.
    let last = "";
    const reportPlayers = () => {
      // Seuls les cadres de taille lecteur comptent : on écarte les petits cadres publicitaires.
      const srcs = [...document.querySelectorAll("iframe")]
        .filter((f) => f.offsetWidth >= 300 && f.offsetHeight >= 150)
        .map((f) => f.src)
        .filter((src) => playerHosts([src], location.hostname).length > 0);
      const key = srcs.join(",");
      if (key === last) return;
      last = key;
      browser.runtime.sendMessage({ type: "players", srcs }).catch(() => {});
    };
    reportPlayers();
    let timer: ReturnType<typeof setTimeout> | undefined;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(reportPlayers, 300);
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });
  },
});
