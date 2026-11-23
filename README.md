# AnimeTrace

![Version](https://img.shields.io/badge/version-1.0.0-f4b400)
![Manifest V3](https://img.shields.io/badge/Chrome%20%2F%20Brave-Manifest%20V3-4285f4)
![TypeScript](https://img.shields.io/badge/TypeScript-WXT%20%2B%20Vite-3178c6)
![Supabase](https://img.shields.io/badge/Cloud-Supabase-3ecf8e)
![MyAnimeList](https://img.shields.io/badge/Catalogue-MyAnimeList-2e51a2)

![AnimeTrace](https://count.getloli.com/@animetrace?theme=moebooru&padding=3&offset=0&align=top&scale=1&pixelated=1&darkmode=0)

Extension Chrome et Brave qui retient automatiquement les épisodes d’anime que tu regardes : position dans la vidéo, épisodes vus, reprise en un clic. Synchronisation entre ordinateurs et mise à jour de ta liste MyAnimeList (MAL), en option.

## Installation

Ouvre la [fiche AnimeTrace sur le Chrome Web Store](https://chromewebstore.google.com/detail/animetrace/oececnmlgocopkohibfpdbkhmnaofooj?hl=fr) dans Chrome ou Brave, puis clique sur le bouton d’installation.

## Fonctionnalités

- Suivi automatique sur les sites pris en charge (Voiranime et ses lecteurs) ; un nouveau domaine s’active en un clic depuis l’icône.
- Bibliothèque par saison de diffusion, avec affiches, totaux et reprise de l’épisode suivant.
- Historique indépendant des adresses des sites : un changement de domaine ne perd rien.
- Synchronisation entre ordinateurs (facultative) via Supabase.
- Catalogue MAL et mise à jour de ta liste MAL (facultative) : le compteur n’est jamais baissé, la note jamais modifiée.
- Export et import de sauvegarde ; migration automatique depuis la 0.3.6.

## Développement

```bash
npm install
cp .env.example .env.local   # projet Supabase (clé publique) et Client ID MAL
npm run dev                  # Brave/Chrome avec rechargement automatique
npm test                     # tests Vitest
npm run build                # extension dans .output/chrome-mv3
```

Base cloud : exécuter une fois `cloud/v1-operations.sql` dans l’éditeur SQL de Supabase. N’utiliser que la clé publique `sb_publishable_…` : aucune clé secrète dans le dépôt.

## Déploiement

Exécute `npm run zip` pour générer le paquet de publication dans `.output/`, puis ouvre l’onglet **Package** de la fiche AnimeTrace et importe le fichier ZIP. [Console développeur du Chrome Web Store](https://chrome.google.com/u/1/webstore/devconsole/22a107a1-cee9-466b-9272-8bc531cb8350/oececnmlgocopkohibfpdbkhmnaofooj/edit) · [Procédure de publication](docs/PUBLICATION-STORE.md)

## Documentation

- [Fonctionnalités](docs/FONCTIONNALITES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Modèle de données](docs/MODELE-DONNEES.md)
- [Parcours et interface](docs/PARCOURS-INTERFACE.md)
- [Politique de confidentialité](docs/POLITIQUE-CONFIDENTIALITE.md)
