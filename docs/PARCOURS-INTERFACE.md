# Parcours et écrans d’AnimeTrace

Résumé destiné à la refonte UI/UX. Il liste les écrans, les situations à prévoir et les règles qui contraignent l’interface. Le périmètre complet est dans [FONCTIONNALITES.md](FONCTIONNALITES.md), l’organisation technique dans [ARCHITECTURE.md](ARCHITECTURE.md).

## Vocabulaire

- **Anime → saison → épisode → version de lecture** (VF, VOSTFR). Une **source de lecture** (site, lecteur) est un accès au contenu, pas un niveau de la hiérarchie.
- MyAnimeList est abrégé **MAL**.
- Pas de statuts « En pause » ni « Abandonné » dans AnimeTrace : une saison commencée non terminée est **en cours**.

## Principes d’interface

- L’usage quotidien ne demande aucune saisie : regarder un épisode suffit.
- L’utilisateur n’intervient que lorsqu’une information manque ou se contredit, et chaque réponse est mémorisée.
- Un problème sur un anime (association, conflit MAL) ne bloque jamais le reste.
- Les états d’attente (hors ligne, MAL indisponible, association à confirmer) sont visibles mais discrets.

## 1. Fenêtre de l’icône

Ouverte par un clic sur l’icône de l’extension.

| Situation                                              | Contenu attendu                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Page d’épisode reconnue                                | Anime, saison, épisode, version ; progression en cours ou « vu » ; lien vers la bibliothèque.                                |
| Page reconnue mais pas un épisode                      | État neutre, accès à la bibliothèque.                                                                                        |
| Nouveau domaine qui ressemble à un site pris en charge | « Cette adresse ressemble à Voiranime. Activer le suivi ici ? » → bouton d’activation, puis demande d’autorisation de Brave. |
| Lecteur vidéo inconnu sur un domaine activé            | Proposition d’autoriser ce lecteur pour suivre la progression.                                                               |
| Site non pris en charge                                | « Site non pris en charge », rien n’est enregistré.                                                                          |
| Autorisation Brave refusée                             | Explication courte et possibilité de réessayer.                                                                              |

Section **Récemment** (toujours présente sous l’état de la page) : derniers animes regardés, triés par dernière lecture, avec affiche, épisode et version lus, date relative, compteur et lien de reprise si disponible. Un anime n’apparaît qu’une fois et chaque épisode compte une fois dans sa saison.

Une navigation interne qui conserve le même document retire l’épisode actif si l’adresse change. Le suivi d’un nouvel épisode commence au chargement de son document.

Actions de pied de fenêtre : bibliothèque, synchronisation immédiate (cloud et MAL), réglages.

Indicateurs globaux discrets : synchronisation cloud (à jour, en attente, hors ligne), MAL (connecté, en attente, action requise).

## 2. Bibliothèque

Page complète de l’extension.

- **Liste des animes** avec affiche MAL, titre, saison en cours, progression (« 9 / 12 », ou « 9 / ? » si total inconnu).
- **Filtres** : en cours, terminés, à confirmer. Aucun filtre En pause/Abandonné.
- **Fiche d’un anime** : saisons, puis épisodes ; pour chaque épisode les versions de lecture avec leur position. Un épisode vu en VF et en VOSTFR compte une seule fois.
- **Bouton « Reprendre »** : ouvre la dernière version commencée ou, après une version terminée, l’épisode suivant si sa source est connue dans la même saison. Une simple ouverture de page influence le tri de la bibliothèque et laisse la reprise à sa place. La fiche affiche la dernière progression même si le lien est indisponible. Le passage à la saison suivante reste à implémenter après validation du périmètre et de la numérotation de la saison locale.
- **Affiche absente** (catalogue non associé ou indisponible) : visuel de remplacement.
- **Nettoyage automatique**. Un anime dont seules des pages d’épisodes ont été consultées disparaît de la bibliothèque sept jours après la dernière ouverture. Une nouvelle ouverture le fait réapparaître. Dès qu’un épisode a été lancé, l’anime reste dans la bibliothèque, même avec zéro épisode vu. Les données de synchronisation restent disponibles pour appliquer une progression reçue d’un autre appareil.

### Situations à prévoir dans la bibliothèque

| Situation                                                              | Comportement attendu                                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Association MAL à confirmer                                            | Badge sur l’anime ; écran de choix parmi les fiches proposées (affiche, titre, saison, format, nombre d’épisodes). Choix mémorisé. La lecture est déjà enregistrée. |
| Association erronée                                                    | Possibilité de changer la fiche MAL associée à une saison.                                                                                                          |
| Rapprochement après changement de titres ou d’identifiants sur le site | « Ce contenu correspond-il à … déjà dans ta bibliothèque ? » ; oui / non, mémorisé.                                                                                 |
| Épisode isolé, MAL à zéro                                              | Question unique : « Les épisodes 1 à 8 sont-ils déjà vus ? ».                                                                                                       |
| Conflit MAL (compteur baissé sur MAL)                                  | Badge sur l’anime ; choix entre garder la valeur MAL ou renvoyer celle d’AnimeTrace. Les autres animes continuent.                                                  |
| Total d’épisodes inconnu                                               | Jamais affiché comme terminé.                                                                                                                                       |

## 3. Réglages

- **Compte cloud** : connexion e-mail et mot de passe, état de synchronisation, dernière synchronisation.
- **Compte MAL** : « Connecter MAL » (ouvre la page officielle), état, déconnexion. La file en attente est conservée après déconnexion.
- **Domaines activés** : liste par site, ajout via la fenêtre de l’icône, retrait possible.
- **Sauvegarde** : export, import avec aperçu du résultat avant validation.
- **Transition 0.3.6** : visible tant qu’un ordinateur n’est pas migré ; bouton pour clore la transition.

## 4. Premier démarrage après mise à jour

1. Écran de migration : sauvegarde automatique créée, conversion en cours.
2. Résultat : « 35 épisodes conservés » avec détail, ou rapport d’échec indiquant que les anciennes données restent actives.
3. Suite proposée : animes à confirmer, connexion MAL facultative.

## 5. Situations transverses

- **Hors ligne** : l’enregistrement continue ; indicateur « en attente ».
- **MAL indisponible ou connexion expirée** : mises à jour en attente, invitation à se reconnecter si nécessaire.
- **Nouvel ordinateur** : connexion cloud, récupération de l’historique, puis autorisations Brave à accepter pour les domaines déjà activés ailleurs.

## Hors périmètre V1

Ajout manuel d’anime, liste À voir, notes personnelles, édition manuelle de l’historique, import de la liste MAL, recommandations, autres sites que Voiranime, reprise automatique de la vidéo à la seconde.

## Maquettes

Maquettes de la refonte : [canevas Doop « AnimeTrace — Design V1 »](https://doop.design/c/hoqgXftPMU). Les cadres V4 sont la référence actuelle.
