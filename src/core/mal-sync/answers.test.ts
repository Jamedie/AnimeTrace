import { describe, expect, it } from "vitest";
import { applyMalAnswer } from "./answers";
import { decideMalUpdate } from "./rules";

describe("réponses aux conflits MAL", () => {
  const conflict = {
    malId: 1,
    lastSent: 3,
    conflict: { remote: 1, lastSent: 3 },
    updatedAt: 0,
  };
  it("Renvoyer : la progression AnimeTrace repart vers MAL", () => {
    const s = applyMalAnswer(conflict, { resend: { remote: 1 } }, 1);
    expect(s.conflict).toBeUndefined();
    expect(
      decideMalUpdate(
        { status: "watching", num_episodes_watched: 1 },
        { watched: [1, 2, 3], total: 13, lastSent: s.lastSent! },
      ),
    ).toEqual({ action: "update", fields: { num_watched_episodes: 3 } });
  });
  it("Garder la valeur MAL : plus de conflit, rien renvoyé jusqu’au prochain épisode", () => {
    const s = applyMalAnswer(
      conflict,
      { keepRemote: { remote: 1, ignoreUntil: 3 } },
      1,
    );
    expect(s).toMatchObject({ lastSent: 1, ignoreUntil: 3 });
    expect(s.conflict).toBeUndefined();
  });
});
