import { describe, expect, it } from "vitest";
import { applyOpened, applyProgress } from "./playback";

const base = { id: "v", episodeId: "e", language: "VOSTFR" as const };

describe("règles de lecture", () => {
  it("ouvrir une page crée une version non vue", () => {
    expect(applyOpened(undefined, base, 10)).toEqual({
      ...base,
      watched: false,
      openedAt: 10,
    });
  });

  it("rouvrir conserve la progression et le statut vu", () => {
    const v = {
      ...base,
      watched: true,
      position: 1300,
      duration: 1400,
      openedAt: 1,
    };
    expect(applyOpened(v, base, 20)).toEqual({ ...v, openedAt: 20 });
  });

  it("vu à 90 % ou à la fin", () => {
    const v = applyOpened(undefined, base, 0);
    expect(
      applyProgress(
        v,
        { position: 1259, duration: 1400, playing: true, ended: false },
        1,
      )?.watched,
    ).toBe(false);
    expect(
      applyProgress(
        v,
        { position: 1260, duration: 1400, playing: true, ended: false },
        1,
      )?.watched,
    ).toBe(true);
    expect(
      applyProgress(
        v,
        { position: 10, duration: 1400, playing: false, ended: true },
        1,
      )?.watched,
    ).toBe(true);
  });

  it("un épisode vu reste vu après retour en arrière", () => {
    const v = { ...base, watched: true };
    expect(
      applyProgress(
        v,
        { position: 5, duration: 1400, playing: true, ended: false },
        1,
      ),
    ).toMatchObject({ watched: true, position: 5 });
  });

  it("ignore le chargement à zéro et les valeurs invalides", () => {
    const v = applyOpened(undefined, base, 0);
    expect(
      applyProgress(
        v,
        { position: 0, duration: 1400, playing: false, ended: false },
        1,
      ),
    ).toBeNull();
    expect(
      applyProgress(
        v,
        { position: 5, duration: NaN, playing: true, ended: false },
        1,
      ),
    ).toBeNull();
    expect(
      applyProgress(
        v,
        { position: 5, duration: 0, playing: true, ended: false },
        1,
      ),
    ).toBeNull();
  });
});
