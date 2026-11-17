import { describe, expect, it } from "vitest";
import { mergeImportedVersion, mergeRemoteProgress } from "./merge";

const base = {
  id: "v",
  episodeId: "e",
  language: "VOSTFR" as const,
  watched: false,
};

describe("fusion entre ordinateurs", () => {
  it("position la plus récente selon l’ordre du serveur, pas selon l’horloge", () => {
    const a = mergeRemoteProgress(
      base,
      { watched: false, position: 600, duration: 1400, updatedAt: 9_999 },
      5,
    );
    // Une opération plus récente côté serveur, même avec une horloge en retard, l'emporte.
    const b = mergeRemoteProgress(
      a,
      { watched: false, position: 700, duration: 1400, updatedAt: 1 },
      6,
    );
    expect(b).toMatchObject({ position: 700, syncRevision: 6 });
    // Une opération plus ancienne côté serveur ne recule pas la position.
    expect(
      mergeRemoteProgress(
        b,
        { watched: false, position: 10, duration: 1400, updatedAt: 99_999 },
        4,
      ),
    ).toMatchObject({ position: 700 });
  });

  it("un épisode vu reste vu, et réappliquer ne change rien", () => {
    const seen = mergeRemoteProgress(
      base,
      { watched: true, position: 1300, duration: 1400, updatedAt: 1 },
      3,
    );
    const again = mergeRemoteProgress(
      mergeRemoteProgress(
        seen,
        { watched: false, position: 5, duration: 1400, updatedAt: 2 },
        4,
      ),
      { watched: true, position: 1300, duration: 1400, updatedAt: 1 },
      3,
    );
    expect(again).toMatchObject({
      watched: true,
      position: 5,
      syncRevision: 4,
    });
  });

  it("import 0.3.6 : vu cumulatif, progression la plus récente par date", () => {
    const local = {
      ...base,
      watched: true,
      position: 100,
      duration: 1400,
      updatedAt: 50,
      openedAt: 40,
    };
    expect(
      mergeImportedVersion(local, {
        ...base,
        position: 900,
        duration: 1400,
        updatedAt: 60,
        openedAt: 30,
      }),
    ).toEqual({
      ...base,
      watched: true,
      position: 900,
      duration: 1400,
      updatedAt: 60,
      openedAt: 40,
    });
    expect(
      mergeImportedVersion(local, { ...base, position: 1, updatedAt: 10 }),
    ).toMatchObject({ position: 100 });
  });
});
