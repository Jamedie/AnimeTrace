import { browser } from "wxt/browser";

export interface PlaybackDocument {
  documentId: string;
  url: string;
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
