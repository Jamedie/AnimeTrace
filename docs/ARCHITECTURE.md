# Architecture technique d’AnimeTrace

Ce document décrit l’organisation technique de la refonte. Il complète [FONCTIONNALITES.md](FONCTIONNALITES.md), qui définit le périmètre, et [MODELE-DONNEES.md](MODELE-DONNEES.md), qui définit les données.

Statuts employés : **validé** (accord explicite), **proposé** (à valider), **à préciser**.

## 1. Principes

- **Validé** : la détection propre à chaque site est isolée dans des connecteurs ; le cœur ne connaît aucune adresse ni structure de page.
- **Validé** : les connecteurs sont livrés avec l’extension, par mise à jour ; aucun code téléchargé à distance (Manifest V3).
- **Validé** : le cœur est l’unique propriétaire des données. Les autres parties lui envoient des messages et ne modifient jamais le stockage directement.
- **Validé** : tout est enregistré localement d’abord ; le cloud et MAL sont alimentés ensuite, par des files d’attente qui survivent aux pannes et aux redémarrages.
- **Validé** : les services externes (Supabase, MAL) sont accessibles uniquement via des adaptateurs, remplaçables sans toucher au cœur.

## 2. Parties de l’extension

Extension Chromium Manifest V3, cible Brave Windows et macOS.

| Partie                                    | Rôle                                                                                                                                      | Statut |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Processus d’arrière-plan (service worker) | Héberge le cœur : réception des événements, écriture de l’historique, files de synchronisation, minuteries, gestion des domaines activés. | Validé |
| Script de page                            | Injecté sur les domaines activés. Choisit le connecteur, extrait l’épisode affiché, envoie un événement normalisé.                        | Validé |
| Script de lecteur                         | Injecté dans les lecteurs vidéo autorisés. Suit la position, la durée et la fin de la vidéo ; envoie des événements de lecture.           | Validé |
| Fenêtre de l’icône                        | État de la page courante, activation d’un nouveau domaine, accès à la bibliothèque.                                                       | Validé |
| Bibliothèque                              | Page de l’extension : anime → saison → épisode → version, associations MAL à confirmer, sauvegarde.                                       | Validé |
| Réglages                                  | Comptes cloud et MAL, domaines activés, export et import.                                                                                 | Validé |

Le service worker peut être arrêté à tout moment par le navigateur : aucun état important ne doit rester uniquement en mémoire.

## 3. Modules du cœur

| Module                | Responsabilité                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Historique            | Applique les événements de lecture : création des versions, positions, statut vu à 90 %, déduplication VF/VOSTFR.                           |
| Identités             | Identifiants internes immuables ; correspondances site → contenu ; rapprochements mémorisés.                                                |
| Catalogue             | Recherche et association des fiches MAL, cache des métadonnées et affiches, associations en attente.                                        |
| Domaines              | Liste des domaines activés par site logique, demande et vérification des autorisations du navigateur, enregistrement dynamique des scripts. |
| Synchronisation cloud | File d’envoi, fusion des données entre ordinateurs. Détail au chapitre stockage.                                                            |
| Synchronisation MAL   | File des mises à jour, règles de progression validées, conflits par anime. Détail au chapitre MAL.                                          |
| Sauvegarde            | Export, import, migration des données 0.3.6.                                                                                                |

## 4. Contrat des connecteurs

**Validé.** Un connecteur est un module qui déclare :

- **Identité** : identifiant du site logique (ex. `voiranime`) et nom affiché.
- **Domaines connus** : liste initiale livrée avec l’extension ; les domaines activés par l’utilisateur s’y ajoutent.
- **Vérification de page** : fonction indiquant si une page correspond à ce site (forme des liens, éléments caractéristiques). Utilisée pour l’activation d’un nouveau domaine.
- **Extraction d’épisode** : fonction qui, sur une page d’épisode, renvoie :
  - identifiant du contenu sur le site (ex. slug Voiranime) ;
  - titre affiché ;
  - numéro d’épisode ;
  - version de lecture (VF, VOSTFR) ;
  - adresse de la page.
- **Lecteurs vidéo** : domaines de lecteurs connus pour ce site.

Le connecteur ne lit ni n’écrit le stockage, n’appelle aucun service externe et ne décide pas du statut vu. Il renvoie « rien » si la page n’est pas reconnue.

Chaque connecteur est accompagné de tests sur des pages enregistrées, afin de détecter un changement de présentation du site sans tester à la main.

## 5. Permissions

**Validé.**

- Permissions fixes : stockage, minuteries, scripting, onglet actif.
- Accès fixes : Supabase et API MAL.
- Domaines de streaming et de lecteurs : déclarés en autorisations facultatives et demandés un par un lors de l’activation. Les scripts sont enregistrés dynamiquement pour les domaines accordés.
- Exception : les domaines déjà autorisés par la 0.3.6 (voiranime.cx, voembed.net, vidmoly) restent déclarés d’office, pour que le suivi fonctionne dès la mise à jour sans nouvel avertissement.
- Aucune règle réseau de modification d’en-têtes : les affiches viennent de MAL.

À vérifier : acceptation par le Chrome Web Store d’autorisations facultatives larges, et comportement de la demande d’autorisation dans Brave.

## 6. Circulation d’un événement

1. Le script de page appelle le connecteur et envoie « épisode affiché » au cœur.
2. Le cœur résout l’identité interne (correspondance connue, sinon création et association en attente).
3. Le script de lecteur envoie position, durée et fin ; le cœur met à jour la version de lecture et le statut vu.
4. Le cœur enregistre localement, puis ajoute les changements aux files cloud et MAL.
5. Les files sont traitées dès que possible et réessayées après une panne.

## 7. Choix d’outillage

**Validé** pour le langage et la construction ; le reste est proposé :

- Langage : **TypeScript** (validé), pour sécuriser le contrat des connecteurs et le modèle de données.
- Construction : **Vite** (validé), avec une sortie par partie de l’extension (service worker, scripts de page et de lecteur, pages).
- Interface : à aligner sur la refonte UI/UX menée avec l’autre agent.
- Tests : Vitest (proposé), unitaires pour le cœur et le convertisseur, tests de connecteurs sur pages enregistrées.

## 8. Stockage local

**Validé.**

- **IndexedDB** pour les données métier : animes, saisons, épisodes, versions de lecture, correspondances de sites, associations MAL, domaines activés, files d’attente. Adapté aux données structurées et accessible depuis le service worker.
- **chrome.storage.local** pour les petits réglages et l’état des connexions.
- Permission `unlimitedStorage` pour ne jamais perdre l’historique à cause d’un quota.
- Chaque modification locale est écrite dans la même transaction que son **opération** à synchroniser : impossible d’avoir une lecture enregistrée mais oubliée par la synchronisation.
- Le schéma porte un numéro de version ; chaque évolution passe par une migration testée.
- Les jetons MAL et cloud ne sont jamais inclus dans les exports.

## 9. Synchronisation entre ordinateurs

**Validé.** Supabase est conservé (compte privé, connexion e-mail et mot de passe, accès limité à son propre compte), mais le principe change : au lieu d’envoyer tout l’historique à chaque fois, chaque ordinateur échange un **journal d’opérations**.

- Une opération décrit un changement : « épisode 9 VOSTFR vu », « position 12 min », « association MAL confirmée », « domaine activé ».
- Chaque opération a un identifiant unique et l’identifiant de l’ordinateur d’origine. Renvoyer deux fois la même opération n’a aucun effet (réessais sans risque).
- Le serveur numérote les opérations dans leur ordre d’arrivée. Chaque ordinateur demande « tout ce qui est arrivé après le numéro N », puis applique les mêmes règles de fusion : le résultat est identique sur tous les ordinateurs.
- Règles de fusion :
  - un épisode vu reste vu ;
  - la position de lecture retenue est la plus récente selon l’ordre du serveur, pas selon l’horloge des ordinateurs ;
  - une association confirmée remplace une association en attente ;
  - les domaines activés s’additionnent.
- Envoi après chaque changement (regroupé sur quelques secondes), récupération au démarrage et à intervalle régulier. Hors ligne, les opérations attendent dans la file locale.
- Un instantané périodique de l’état pourra être ajouté pour accélérer l’installation sur un nouvel ordinateur ; inutile au volume actuel.

Ce qui ne passe pas par le cloud :

- La connexion MAL reste propre à chaque ordinateur ; ses jetons ne sont pas stockés sur Supabase. Le compteur MAL ne faisant qu’augmenter, deux ordinateurs connectés n’envoient pas de mise à jour contradictoire.
- Les autorisations Brave de domaine, à accepter sur chaque ordinateur.

Transition depuis la 0.3.6 : la table actuelle `anime_histories` reste intacte et lisible pendant la migration ; les nouvelles tables sont séparées. Le détail figure dans [MODELE-DONNEES.md](MODELE-DONNEES.md).

## 10. Connexion et synchronisation MAL

**Validé.** Les règles fonctionnelles sont celles validées dans [FONCTIONNALITES.md](FONCTIONNALITES.md) ; ce chapitre décrit leur mise en œuvre.

### Connexion du compte

- Bouton « Connecter MAL » dans les réglages. La page officielle de MAL s’ouvre ; l’utilisateur y accepte l’accès, puis revient automatiquement dans l’extension (`chrome.identity.launchWebAuthFlow`).
- Méthode officielle OAuth 2 avec code d’autorisation et vérification PKCE, sans mot de passe MAL saisi dans l’extension.
- Jetons conservés dans `chrome.storage.local` de l’ordinateur, jamais dans le cloud, les exports ou le dépôt. Renouvellement automatique avant expiration ; si le renouvellement échoue, l’extension demande de se reconnecter, sans perdre les mises à jour en attente.
- Déconnexion : suppression des jetons locaux ; la file est conservée et reprendra à la prochaine connexion.

À vérifier : prise en charge de `launchWebAuthFlow` dans Brave, type d’application MAL sans secret client, méthode PKCE acceptée par MAL.

### File des mises à jour

- Une seule entrée en attente par anime MAL, contenant l’objectif à atteindre (ex. « 9 épisodes vus »). Plusieurs épisodes regardés hors ligne se regroupent en une seule mise à jour.
- Seules les saisons associées et confirmées à une fiche MAL produisent une mise à jour ; les associations en attente patientent sans bloquer le reste.
- Traitement au fil de l’eau et au démarrage. En cas de panne ou de limite de débit, nouvel essai avec attente croissante.

### Envoi d’une mise à jour

1. Lire l’état actuel de l’anime sur la liste MAL.
2. Calculer la valeur cible :
   - compteur = maximum entre le compteur MAL et la progression AnimeTrace ; jamais de diminution ;
   - statut « En cours » si l’anime n’était pas dans la liste ou était prévu ;
   - statut « Terminé » seulement si le total MAL est connu (différent de zéro) et atteint ;
   - si MAL indique « En pause » ou « Abandonné » et qu’un nouvel épisode est vu, l’anime repasse « En cours » : ces statuts ne sont pas préservés ;
   - note et autres champs : inchangés.
3. Si l’épisode détecté est isolé et que MAL indique zéro, ne rien envoyer et poser une fois la question des épisodes précédents.
4. Envoyer uniquement les champs modifiés, puis mémoriser la valeur envoyée.

### Conflits

- Si le compteur MAL est inférieur à une valeur qu’AnimeTrace a déjà envoyée, l’utilisateur l’a probablement baissé volontairement : l’anime passe en « conflit », sans envoi automatique, jusqu’au choix de l’utilisateur dans la bibliothèque.
- Un conflit ne bloque ni l’enregistrement local, ni les autres animes.

## 11. Migration depuis la 0.3.6

**Validé.** Les règles de conversion figurent dans [MODELE-DONNEES.md](MODELE-DONNEES.md), section 5. Ce chapitre décrit leur exécution.

- La V1 porte l’identifiant de la fiche Chrome Web Store (oececnmlgocopkohibfpdbkhmnaofooj), fixé par la clé publique dans le manifeste, y compris en installation locale. La 0.3.6 installée en local a un autre identifiant : ses données ne sont pas lisibles directement. Elles arrivent par l’import du cloud 0.3.6 (ci-dessous) ou par l’import d’un fichier exporté. La lecture sur place reste utilisée si une version portant le même identifiant existait déjà.
- Au premier démarrage :
  1. une copie intacte de l’historique 0.3.6 est conservée dans la nouvelle base ; l’écran de migration propose un bouton « Exporter » pour l’enregistrer en fichier (pas de permission de téléchargement automatique) ;
  2. l’historique est converti dans la nouvelle base, sans modifier les anciennes données ;
  3. le résultat est vérifié (nombre d’épisodes, statuts vus, positions) ;
  4. la nouvelle base devient active seulement si tout concorde ; sinon l’extension reste sur les anciennes données et affiche le rapport.
- Le convertisseur est un module indépendant, testé d’abord hors de l’extension sur la sauvegarde fournie (35 entrées).
- Aucune écriture MAL pendant la migration ; les associations proposées restent à confirmer ou s’appliquent comme prévu, puis la synchronisation MAL démarre normalement.

### Cloud et ordinateurs non mis à jour

- La V1 lit l’historique cloud 0.3.6 (`anime_histories`) et l’importe dans le nouveau journal, sans jamais y écrire.
- Tant qu’un ordinateur reste en 0.3.6, la V1 réimporte régulièrement cet ancien historique ; grâce aux identifiants déterministes, rien n’est dupliqué.
- Quand tous les ordinateurs sont en V1, l’utilisateur clôt la transition dans les réglages ; l’ancienne table est conservée en lecture seule pour récupération.

## 12. Structure des fichiers

**Validé.** Construction avec **WXT**, un outil basé sur Vite dédié aux extensions : chaque fichier de `entrypoints/` devient automatiquement une partie de l’extension, et le `manifest.json` est généré.

```text
AnimeTrace/
├── docs/                      Documents de référence
├── wxt.config.ts              Configuration : nom, permissions, manifeste
├── package.json
├── tsconfig.json
├── public/
│   └── icons/                 Icônes de l’extension
├── src/
│   ├── entrypoints/           Une entrée = une partie de l’extension
│   │   ├── background.ts      Service worker : démarre le cœur
│   │   ├── page.content.ts    Script de page : appelle les connecteurs
│   │   ├── player.content.ts  Script de lecteur : suit la vidéo
│   │   ├── popup/             Fenêtre de l’icône (index.html + main.ts)
│   │   ├── library/           Bibliothèque
│   │   └── settings/          Réglages
│   ├── core/                  Cœur, sans dépendance au navigateur
│   │   ├── history/           Événements de lecture, statut vu
│   │   ├── identity/          Identifiants internes, rapprochements
│   │   ├── catalog/           Associations MAL
│   │   ├── domains/           Domaines activés
│   │   ├── sync/              Journal d’opérations et fusion
│   │   ├── mal-sync/          File et règles MAL
│   │   └── backup/            Export, import, migration 0.3.6
│   ├── connectors/            Un dossier par site
│   │   ├── types.ts           Contrat commun des connecteurs
│   │   ├── index.ts           Liste des connecteurs livrés
│   │   └── voiranime/
│   │       ├── connector.ts
│   │       └── fixtures/      Pages enregistrées pour les tests
│   ├── adapters/              Accès aux services extérieurs et au navigateur
│   │   ├── storage/           IndexedDB, chrome.storage
│   │   ├── supabase/
│   │   ├── mal/               API et connexion OAuth
│   │   └── browser/           Autorisations, scripts dynamiques, messages
│   ├── shared/                Types du modèle de données, messages internes
│   └── ui/                    Composants communs aux pages (issus de la refonte UI/UX)
├── cloud/                     Scripts SQL Supabase (nouvelles tables)
└── tests/                     Tests transverses (migration de la sauvegarde 0.3.6)
```

Règles de dépendance :

- `core/` n’appelle jamais `chrome.*`, le réseau ni le DOM : il est testable sans navigateur.
- `connectors/` ne dépend que de son contrat et du DOM de la page.
- Seul `adapters/` touche au navigateur, à Supabase et à MAL.
- Les pages (`popup`, `library`, `settings`) passent par des messages vers le service worker, jamais directement par le stockage.

Différence avec un site : il n’y a pas de serveur. Le dossier construit (`.output/chrome-mv3/`) se charge dans Brave via « Charger l’extension non empaquetée » en mode développeur ; WXT le recharge automatiquement pendant le développement. Pour la publication, ce dossier est compressé en ZIP.

## 13. Chapitres à rédiger

- Aucun chapitre en attente ; seule l’interface reste à aligner avec la refonte UI/UX (dossiers `entrypoints/` et `ui/`).
