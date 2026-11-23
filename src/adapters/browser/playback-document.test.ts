import { beforeEach, expect, it, vi } from "vitest";
import { playbackDocument, matchesDocument } from "./playback-document";

const { executeScript } = vi.hoisted(() => ({ executeScript: vi.fn() }));
vi.mock("wxt/browser", () => ({ browser: { scripting: { executeScript } } }));

const url = "https://voiranime.cx/anime/title/title-01-vf/";

beforeEach(() => {
  executeScript.mockReset();
});

it("refuse le document précédent après un rechargement de la même URL", async () => {
  executeScript.mockResolvedValue([{ documentId: "new-page", result: url }]);
  const current = await playbackDocument(10);
  expect(matchesDocument(current, { documentId: "old-page", url })).toBe(false);
  expect(matchesDocument(current, { documentId: "new-page", url })).toBe(true);
});

it("refuse le rapport tardif d’un lecteur remplacé dans le même cadre", async () => {
  executeScript.mockResolvedValue([{ documentId: "new-player", result: url }]);
  const current = await playbackDocument(10, 3);
  expect(executeScript).toHaveBeenCalledWith(
    expect.objectContaining({ target: { tabId: 10, frameIds: [3] } }),
  );
  expect(matchesDocument(current, { documentId: "old-player", url })).toBe(false);
});

it("refuse les liaisons sans document et les cadres devenus inaccessibles", async () => {
  executeScript.mockRejectedValue(new Error("No frame with id"));
  expect(await playbackDocument(10, 3)).toBeNull();
  expect(matchesDocument(null, { documentId: "old-player", url })).toBe(false);
  expect(matchesDocument({ documentId: "new-page", url }, { url })).toBe(false);
});
