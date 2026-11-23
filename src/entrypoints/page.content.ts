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
  main(ctx) {
    const w = window as unknown as { __animetracePage?: boolean };
    if (w.__animetracePage) return;
    w.__animetracePage = true;
    // Le changement de lecteur (myTV, MOON, VOE…) remplace l'iframe : on suit ces changements.
    let last: string | undefined;
    let episodePage = false;
    const reportPlayers = () => {
      if (!episodePage) return;
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
    const reportPage = () => {
      const observation = observeEpisode(document, new URL(location.href));
      episodePage = !!observation;
      last = undefined;
      browser.runtime
        .sendMessage(
          observation ? { type: "episode", observation } : { type: "page.clear" },
        )
        .catch(() => {});
      reportPlayers();
    };
    reportPage();
    ctx.addEventListener(window, "pageshow", (event) => {
      if (event.persisted) reportPage();
    });
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
