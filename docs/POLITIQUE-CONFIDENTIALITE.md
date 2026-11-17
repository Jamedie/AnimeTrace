# Politique de confidentialité — AnimeTrace

Dernière mise à jour : 17 novembre 2026. S’applique à la V1 ; remplace la politique de la version 0.3.6 à la publication.

AnimeTrace est une extension personnelle de suivi des épisodes d’anime. Elle conserve un historique sur l’ordinateur et, si l’utilisateur le choisit, le synchronise entre ses ordinateurs (cloud AnimeTrace, hébergé sur Supabase) et met à jour sa liste MyAnimeList (MAL).

## Données traitées

- **Lectures** : titre de l’anime tel qu’affiché par le site, identifiant du contenu sur le site, numéro d’épisode, langue (VF, VOSTFR), adresse de la page d’épisode, dates d’ouverture et de lecture, position, durée, statut vu.
- **Domaines activés** : nom des sites et lecteurs vidéo que l’utilisateur a autorisés.
- **Catalogue MAL** : fiche associée à chaque saison (identifiant, titre, affiche, nombre d’épisodes), mise en cache sur l’ordinateur.
- **Compte cloud** (facultatif) : adresse e-mail, identifiant du compte et jetons de session. Le mot de passe est transmis au service d’authentification puis oublié ; il n’est jamais enregistré.
- **Compte MAL** (facultatif) : nom d’utilisateur MAL et jetons d’accès. La connexion se fait sur la page officielle de MAL ; le mot de passe MAL n’est jamais saisi dans l’extension.
- **Copie 0.3.6** : copie intacte de l’ancien historique, conservée lors de la migration.

L’extension ne lit pas l’historique général du navigateur. Elle n’agit que sur les sites et lecteurs inclus d’office ou activés explicitement par l’utilisateur. Elle n’enregistre ni les frappes au clavier, ni les communications personnelles, ni les flux vidéo.

## Autorisations

- **Sites et lecteurs** : Voiranime et ses lecteurs d’origine sont inclus. Tout autre domaine n’est accessible qu’après un clic de l’utilisateur et la confirmation de Brave ou Chrome.
- **Navigation des cadres** (facultative) : sert seulement à reconnaître un lecteur vidéo qui change d’adresse, dans l’onglet où l’utilisateur la demande.
- **Identité** (facultative) : sert seulement à ouvrir la page de connexion MAL.

## Utilisation et destinataires

Les données servent uniquement à suivre la lecture, afficher la bibliothèque, synchroniser l’historique entre les ordinateurs de l’utilisateur et mettre à jour sa liste MAL.

- **Supabase** (si le cloud est connecté) : reçoit par HTTPS le journal des lectures, des domaines activés, des associations MAL et des réponses aux questions MAL. Politique : https://supabase.com/privacy.
- **MyAnimeList** : reçoit les titres recherchés pour trouver les fiches ; si le compte est connecté, le nombre d’épisodes vus et le statut (En cours, Terminé) de chaque anime suivi. La note n’est jamais modifiée et le compteur n’est jamais baissé. Les affiches sont chargées depuis les serveurs de MAL. Politique : https://myanimelist.net/about/privacy_policy.
- **Sites d’anime et lecteurs** : reçoivent les requêtes habituelles de toute visite (dont l’adresse IP), comme sans l’extension.

AnimeTrace ne vend pas les données, ne les utilise pas pour la publicité ni pour aucune finalité étrangère à son fonctionnement. L’extension n’intègre aucun service de mesure d’audience.

## Conservation et suppression

- L’historique, le cache MAL et les réglages restent dans le profil du navigateur et sont supprimés à la désinstallation de l’extension.
- Un fichier exporté (Réglages → Sauvegarde) appartient à l’utilisateur et se supprime séparément. Il ne contient ni mot de passe ni jeton de session.
- La déconnexion du cloud ou de MAL supprime les jetons de l’ordinateur ; l’historique local est conservé.
- Les données cloud restent dans le projet Supabase jusqu’à leur suppression par son propriétaire (tables `animetrace_operations` et, pour l’ancienne version, `anime_histories`). La désinstallation ne les supprime pas. Les données envoyées à MAL suivent les règles de MAL.

## Sécurité

Les règles de la base limitent l’accès de chaque compte à ses propres données. Les échanges passent par HTTPS. L’extension n’utilise que la clé publique du projet Supabase et l’identifiant public de l’application MAL ; aucune clé secrète n’est incluse.

## Contact et modifications

Éditeur : Jamedie — https://github.com/Jamedie. Pour toute question, utiliser les coordonnées publiques de ce profil.

Cette politique sera mise à jour si le fonctionnement de l’extension évolue.
