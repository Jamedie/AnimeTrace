import { describe, expect, it } from "vitest";
import { decideMalUpdate } from "./rules";

describe("règles de mise à jour MAL", () => {
  it("MAL indique 8, je regarde le 9 : passe à 9, En cours", () => {
    expect(
      decideMalUpdate(
        { status: "watching", num_episodes_watched: 8 },
        { watched: [9], total: 12 },
      ),
    ).toEqual({ action: "update", fields: { num_watched_episodes: 9 } });
  });

  it("anime absent de la liste : ajouté En cours", () => {
    expect(decideMalUpdate(null, { watched: [1, 2], total: null })).toEqual({
      action: "update",
      fields: { num_watched_episodes: 2, status: "watching" },
    });
  });

  it("épisode isolé avec MAL à zéro : demande une fois", () => {
    expect(
      decideMalUpdate({ num_episodes_watched: 0 }, { watched: [9], total: 12 }),
    ).toEqual({ action: "ask-previous", from: 1, to: 8 });
    expect(
      decideMalUpdate(
        { num_episodes_watched: 0 },
        { watched: [9], total: 12, previousAnswer: true },
      ),
    ).toEqual({
      action: "update",
      fields: { num_watched_episodes: 9, status: "watching" },
    });
    expect(
      decideMalUpdate(
        { num_episodes_watched: 0 },
        { watched: [9], total: 12, previousAnswer: false },
      ),
    ).toEqual({ action: "none" });
  });

  it("ne diminue jamais le compteur", () => {
    expect(
      decideMalUpdate(
        { status: "watching", num_episodes_watched: 10 },
        { watched: [3], total: 12 },
      ),
    ).toEqual({ action: "none" });
  });

  it("Terminé seulement si le total est connu et atteint", () => {
    expect(
      decideMalUpdate(
        { status: "watching", num_episodes_watched: 11 },
        { watched: [12], total: 12 },
      ),
    ).toEqual({
      action: "update",
      fields: { num_watched_episodes: 12, status: "completed" },
    });
    expect(
      decideMalUpdate(
        { status: "watching", num_episodes_watched: 11 },
        { watched: [12], total: null },
      ),
    ).toEqual({ action: "update", fields: { num_watched_episodes: 12 } });
  });

  it("En pause ou Abandonné sur MAL : repasse En cours avec un nouvel épisode", () => {
    expect(
      decideMalUpdate(
        { status: "on_hold", num_episodes_watched: 4 },
        { watched: [5], total: 12 },
      ),
    ).toEqual({
      action: "update",
      fields: { num_watched_episodes: 5, status: "watching" },
    });
  });

  it("compteur baissé sur MAL après un envoi : conflit, rien n’est envoyé", () => {
    expect(
      decideMalUpdate(
        { status: "watching", num_episodes_watched: 1 },
        { watched: [1, 2, 3], total: 13, lastSent: 3 },
      ),
    ).toEqual({ action: "conflict", remote: 1, lastSent: 3 });
  });
});
