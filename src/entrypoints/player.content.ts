// Script de lecteur : suit la position des vidéos HTML (pages et lecteurs autorisés).
// Reprend la logique de la 0.3.6 : envoi au plus toutes les 5 s, plus lancement, pause et fin.
import { browser } from "wxt/browser";

export default defineContentScript({
  // Mêmes accès que la 0.3.6 : aucun nouvel avertissement lors de la mise à jour.
  matches: [
    "https://voiranime.cx/*",
    "https://voembed.net/*",
    "https://*.vidmoly.me/*",
    "https://*.vidmoly.net/*",
  ],
  registration: "runtime",
  allFrames: true,
  runAt: "document_idle",
  main() {
    // Peut être injecté deux fois (enregistrement + injection directe après autorisation) : une seule fois suffit.
    const w = window as unknown as { __animetracePlayer?: boolean };
    if (w.__animetracePlayer) return;
    w.__animetracePlayer = true;
    const attached = new WeakSet<HTMLVideoElement>();
    const scan = () => {
      document.querySelectorAll("video").forEach((video) => {
        if (attached.has(video)) return;
        attached.add(video);
        let last = 0;
        const report = (event: Event) => {
          const now = Date.now();
          if (event.type === "timeupdate" && now - last < 5000) return;
          if (!Number.isFinite(video.duration) || video.duration <= 0) return;
          last = now;
          browser.runtime
            .sendMessage({
              type: "progress",
              report: {
                position: video.currentTime,
                duration: video.duration,
                playing: !video.paused,
                ended: video.ended,
              },
            })
            .catch(() => {});
        };
        for (const name of [
          "timeupdate",
          "playing",
          "pause",
          "ended",
          "loadedmetadata",
        ])
          video.addEventListener(name, report);
      });
    };
    scan();
    new MutationObserver(scan).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  },
});
