import { describe, expect, it } from "vitest";
import { originPattern, originsToRequest, playerHosts } from "./origins";

describe("domaines et autorisations", () => {
  it("extrait les hôtes de lecteurs https, sans la page elle-même", () => {
    expect(
      playerHosts(
        [
          "https://mfw09.org/e/x",
          "https://voe.sx/e/y",
          "https://voe.sx/e/z",
          "about:blank",
          "http://insecure.test/",
          "https://voiranime.to/player",
        ],
        "voiranime.to",
      ),
    ).toEqual(["mfw09.org", "voe.sx"]);
  });
  it("construit les motifs demandés à Brave", () => {
    expect(originPattern("voiranime.to")).toBe("https://voiranime.to/*");
    expect(originsToRequest(["a.test", "a.test", "b.test"])).toEqual([
      "https://a.test/*",
      "https://b.test/*",
    ]);
  });
});

import { redirectedPlayerHosts } from "./origins";
describe("lecteurs qui redirigent", () => {
  it("retrouve la vraie adresse de VOE sans prendre les publicités", () => {
    const frames = [
      "https://voiranime.cx/anime/x/x-01-vostfr/",
      "https://arianathankspecial.com/e/qqlt90wbxj7l",
      "https://ads.example/banner",
    ];
    expect(
      redirectedPlayerHosts(
        frames,
        ["https://voe.sx/e/qqlt90wbxj7l"],
        "voiranime.cx",
      ),
    ).toEqual(["arianathankspecial.com"]);
  });
  it("rien si le lecteur ne redirige pas", () => {
    expect(
      redirectedPlayerHosts(
        ["https://voe.sx/e/abc"],
        ["https://voe.sx/e/abc"],
        "voiranime.cx",
      ),
    ).toEqual([]);
  });
});
