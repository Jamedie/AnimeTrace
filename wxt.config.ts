import { defineConfig } from "wxt";

// Configuration de l'extension. Le manifest.json est généré à partir d'ici.
export default defineConfig({
  srcDir: "src",
  publicDir: "public",
  // Mode « store » (npm run zip) : sans le champ key, refusé par le Chrome Web Store
  // (le Store fournit lui-même l'identifiant de la fiche).
  manifest: ({ mode }) => ({
    name: "AnimeTrace",
    description:
      "Historique durable de tes épisodes d’anime, indépendant des changements de domaine.",
    // Les domaines de streaming sont demandés un par un lors de l'activation (ARCHITECTURE.md §5).
    permissions: [
      "storage",
      "unlimitedStorage",
      "alarms",
      "scripting",
      "activeTab",
    ],
    // Synchronisation cloud : même accès que la 0.3.6, donc aucun nouvel avertissement à la mise à jour.
    // Voiranime et ses lecteurs d'origine : déjà accordés par la 0.3.6 (ARCHITECTURE.md §5, exception).
    host_permissions: [
      "https://*.supabase.co/*",
      "https://voiranime.cx/*",
      "https://voembed.net/*",
      "https://*.vidmoly.me/*",
      "https://*.vidmoly.net/*",
    ],
    optional_host_permissions: ["https://*/*"],
    // Demandée seulement si un lecteur redirige vers une autre adresse (ex. VOE) : liste les vrais cadres de la page.
    // Demandée seulement à la connexion du compte MAL (retour depuis la page officielle de MAL).
    optional_permissions: ["webNavigation", "identity"],
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
    action: { default_title: "AnimeTrace" },
    // Clé publique de la fiche Chrome Web Store : même identifiant (oececnmlgocopkohibfpdbkhmnaofooj)
    // en local et sur le Store. Clé publique, non secrète.
    ...(mode !== "store" && {
      key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAm1ESWCpCQUdXnEDijFYdPvau+QrcJZdwlZE8IM5or1MFt3ugqS4W3y61ltCPTCUVRhu0lAO32TWpLUoCssLB8y/jm2wrHkSe6mcbxiQ43RtWpU9UDuQU6v63q08qoHe22grttpqc9UPoNLHxyzFdarlWfEvfULrV9lz7LLwD6H+Fhbt99ErHe7eQQWzbV2QF484G9O/ub75jrOTbEpSYKmgBrQCzXn99qUrzpnJ59gAc5WX5ADwavriptiKzVmx4DKsnIumh56f2Sw8NnfONrAEbbEYdaG+qy228RXmKqu9f74WojkxyvJr8sCxsP7V4hyTwybEHciVE8dqObtk4NQIDAQAB",
    }),
  }),
});
