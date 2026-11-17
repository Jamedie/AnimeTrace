// Sonde injectée uniquement après un clic sur l'icône (autorisation « onglet actif »),
// sur une adresse non encore activée : la page ressemble-t-elle à un site pris en charge ?
// Ne lit que la structure de la page et n'enregistre rien.
import { browser } from "wxt/browser";
import { detectSite } from "../connectors";
import { playerHosts } from "../core/domains/origins";

export default defineUnlistedScript(() => {
  const site = detectSite(document, new URL(location.href));
  browser.runtime
    .sendMessage({
      type: "probe.result",
      host: location.hostname,
      site: site ? { id: site.id, name: site.name } : null,
      players: playerHosts(
        [...document.querySelectorAll("iframe")].map((f) => f.src),
        location.hostname,
      ),
    })
    .catch(() => {});
});
