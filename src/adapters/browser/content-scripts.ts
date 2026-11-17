// Enregistrement dynamique des scripts sur les domaines autorisés par l'utilisateur
// (ARCHITECTURE.md §5). Aucun domaine n'est accessible sans autorisation.
import { browser } from "wxt/browser";

const PAGE_ID = "animetrace-page";
const PLAYER_ID = "animetrace-player";

/** Origines https accordées par l'utilisateur (domaines de site et de lecteurs). */
export async function grantedOrigins(): Promise<string[]> {
  const { origins = [] } = await browser.permissions.getAll();
  // Le cloud n'est pas un site de lecture : aucun script n'y est injecté.
  return origins.filter(
    (o) => o.startsWith("https://") && !/supabase.co|myanimelist.net/.test(o),
  );
}

let pending: Promise<unknown> = Promise.resolve();

/**
 * (Ré)enregistre les scripts pour toutes les origines accordées.
 * Les appels sont mis en file : deux mises à jour simultanées (autorisation accordée +
 * domaine activé) ne doivent pas laisser les scripts désinscrits pendant un rechargement.
 */
export function syncContentScripts(): Promise<string[]> {
  const run = pending.then(doSync, doSync);
  pending = run.catch(() => {});
  return run;
}

async function doSync(): Promise<string[]> {
  const origins = await grantedOrigins();
  const existing = await browser.scripting.getRegisteredContentScripts({
    ids: [PAGE_ID, PLAYER_ID],
  });
  if (existing.length)
    await browser.scripting.unregisterContentScripts({
      ids: existing.map((s) => s.id),
    });
  if (origins.length === 0) return origins;
  await browser.scripting.registerContentScripts([
    {
      id: PAGE_ID,
      js: ["content-scripts/page.js"],
      matches: origins,
      runAt: "document_idle",
      persistAcrossSessions: true,
    },
    {
      id: PLAYER_ID,
      js: ["content-scripts/player.js"],
      matches: origins,
      allFrames: true,
      runAt: "document_idle",
      persistAcrossSessions: true,
    },
  ]);
  return origins;
}
