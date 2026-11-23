import { browser } from "wxt/browser";

export interface PlaybackDocument {
  documentId: string;
  url: string;
}

interface TabBinding extends PlaybackDocument {
  versionId: string;
  site: string;
}

interface TabPlayers extends PlaybackDocument {
  srcs: string[];
}

export async function readPlaybackTab(tabId: number, active?: PlaybackDocument) {
  const tabKey = `tab:${tabId}`;
  const playersKey = `players:${tabId}`;
  const session = await browser.storage.session.get([tabKey, playersKey]);
  const saved = session[tabKey] as TabBinding | undefined;
  const document = active ?? (saved ? await playbackDocument(tabId) : null);
  const players = session[playersKey] as TabPlayers | undefined;
  return {
    binding: matchesDocument(document, saved) ? saved : undefined,
    playerSrcs: matchesDocument(document, players) ? players?.srcs ?? [] : [],
  };
}

export async function bindPlaybackTab(tabId: number, binding: TabBinding) {
  await browser.storage.session.set({ [`tab:${tabId}`]: binding });
}

export async function savePlaybackPlayers(tabId: number, players: TabPlayers) {
  await browser.storage.session.set({ [`players:${tabId}`]: players });
}

export async function clearPlaybackTab(tabId: number) {
  await browser.storage.session.remove([`tab:${tabId}`, `players:${tabId}`]);
}

/** Interroge le cadre actuellement chargé, même après un redémarrage du service worker. */
export async function playbackDocument(
  tabId: number,
  frameId = 0,
): Promise<PlaybackDocument | null> {
  try {
    const [frame] = await browser.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: () => location.href,
    });
    return frame?.documentId && frame.result
      ? { documentId: frame.documentId, url: frame.result }
      : null;
  } catch {
    // Le cadre peut avoir disparu ou navigué vers un site sans autorisation.
    return null;
  }
}

export function matchesDocument(
  active: PlaybackDocument | null,
  candidate: Partial<PlaybackDocument> | undefined,
): boolean {
  return !!active &&
    active.documentId === candidate?.documentId &&
    active.url === candidate.url;
}
