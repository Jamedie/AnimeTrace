# Publication sur le Chrome Web Store

Identifiant de la fiche AnimeTrace sur le Chrome Web Store : `oececnmlgocopkohibfpdbkhmnaofooj`.

## 1. Construire le paquet

```bash
npm test
npm run zip   # .output/animetrace-<version>-chrome-store.zip, sans le champ « key » refusé par le Store
```

Le build local (`npm run build`) garde le champ `key` pour avoir le même identifiant que le Store.

## 2. Mettre à jour le projet Supabase

Avant de distribuer la 1.0.3, exécuter le script `cloud/v1-operations.sql` du dépôt dans le SQL Editor de Supabase. Il autorise les retraits et les réponses de bibliothèque et conserve les opérations existantes.

## 3. Mettre à jour la fiche

Tableau de bord développeur → AnimeTrace → **Package** → importer le zip, puis renseigner les onglets ci-dessous.

### Fiche

- **Description courte** : Historique durable de tes épisodes d’anime, indépendant des changements de domaine.
- **Description** :

  > AnimeTrace retient automatiquement les épisodes d’anime que tu regardes : position dans la vidéo, épisodes vus, reprise de l’épisode suivant en un clic.
  >
  > • Suivi automatique sur les sites pris en charge ; un nouveau domaine s’active en un clic depuis l’icône.
  > • Historique indépendant des adresses des sites : un changement de domaine ne perd rien.
  > • Bibliothèque par saison de diffusion, avec affiches et nombre d’épisodes MyAnimeList.
  > • Synchronisation entre tes ordinateurs (facultative).
  > • Mise à jour de ta liste MyAnimeList (facultative) : le compteur n’est jamais baissé, ta note jamais modifiée.
  > • Export et import de sauvegarde.
  >
  > Aucune publicité, aucune mesure d’audience.

- **Captures** (1280 × 800) : à refaire avec la V1 — fenêtre de l’icône sur un épisode, bibliothèque, fiche d’un anime, Réglages.

### Confidentialité — justification des autorisations

| Autorisation | Justification |
|---|---|
| `storage`, `unlimitedStorage` | Conserver l’historique des épisodes sur l’ordinateur, sans limite de taille. |
| `alarms` | Synchroniser l’historique toutes les minutes quand le cloud est connecté. |
| `scripting` | Lancer le suivi sur les sites et lecteurs que l’utilisateur a autorisés. |
| `activeTab` | Détecter le site et le lecteur de l’onglet ouvert quand l’utilisateur clique sur l’icône, pour proposer de l’activer. |
| Hôtes `voiranime.cx`, `voembed.net`, `vidmoly` | Site et lecteurs pris en charge d’office (déjà accordés par la 0.3.6) : lire le titre et le numéro de l’épisode, et la position de la vidéo. |
| Hôte `*.supabase.co` | Synchronisation facultative de l’historique entre les ordinateurs de l’utilisateur. |
| Facultatif `https://*/*` | Demandé domaine par domaine, après un clic de l’utilisateur, pour suivre un nouveau site ou lecteur. |
| Facultatif `webNavigation` | Demandé seulement si un lecteur change d’adresse (ex. VOE), pour le reconnaître. |
| Facultatif `identity` | Demandé seulement à la connexion du compte MyAnimeList (page officielle de MAL). |

- **Objectif unique** : suivre les épisodes d’anime regardés et permettre de reprendre la lecture.
- **Code distant** : non.
- **Données collectées** : historique de navigation limité aux pages d’épisodes des sites autorisés ; informations d’authentification (e-mail, jetons de session) si le cloud ou MAL est connecté. Ni vente, ni usage sans rapport avec la fonction, ni évaluation de solvabilité.
- **Politique de confidentialité** : https://github.com/Jamedie/AnimeTrace/blob/main/docs/POLITIQUE-CONFIDENTIALITE.md
