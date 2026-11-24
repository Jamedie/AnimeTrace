# AnimeTrace — Modèle de données

Document de conception du 17 novembre 2026. Il définit la cible de la refonte ; aucune migration ni modification du cloud n’est exécutée. Le stockage physique et les migrations SQL seront définis lors de l’implémentation.

AnimeTrace conserve automatiquement l’historique personnel indépendamment des domaines de streaming. MyAnimeList fournit le catalogue principal et une synchronisation de compte facultative. Une panne du catalogue ne bloque jamais une lecture locale.

## 1. Identités et hiérarchie

La hiérarchie visible est **anime → saison → épisode → version de lecture**. Chaque entité possède un identifiant interne immuable. Les titres, numéros et URL sont des attributs, jamais les seules identités persistantes.

| Entité             | Champs essentiels                                                      | Règle                                                                                                         |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Anime              | id, titre affiché, alias                                               | Regroupe les saisons ; ne représente pas automatiquement toute une franchise ou ses adaptations.              |
| Saison             | id, animeId, numéro nullable, titre, type, ordre affiché               | Type : saison, film, OAV, spécial ou inconnu. Un numéro inconnu reste null.                                   |
| Épisode            | id, seasonId, numéro affiché, type, ordre nullable                     | Le numéro affiché est une chaîne : 6.5 et SP1 sont possibles. Aucun épisode antérieur n’est inventé comme vu. |
| Version de lecture | id, episodeId, audio, sous-titres, libellé source, édition nullable    | VF et VOSTFR sont distinctes. Le libellé brut est conservé si les langues exactes sont inconnues.             |
| Source de lecture  | id, versionId, fournisseur, clé de fiche, clé d’épisode, URL observées | Le fournisseur logique Voiranime est séparé de ses domaines successifs.                                       |
| Progression        | versionId, sourceId, position, durée, date de lecture, preuve de fin   | La position précise reste liée à la source/édition pour éviter de la transposer sur un montage différent.     |

Un film utilise un regroupement de type film et un épisode unique ; il ne devient pas artificiellement une « saison 0 ». Une fiche source sans saison connue reçoit un regroupement provisoire. Un rattachement ultérieur conserve ses lectures.

Un changement de domaine conserve les correspondances existantes si les clés de contenu restent stables. Un changement de slug exige une nouvelle correspondance. La prise en charge technique du nouveau domaine (permissions, détection et lecteur) est distincte de cette reconnaissance.

## 2. Statuts de visionnage

- **Consulté** : page reconnue, sans preuve de lecture.
- **En cours** : lecture réelle détectée, épisode non vu.
- **Vu** : seuil actuel de 90 % ou événement de fin. Une réouverture ou un retour en arrière ne retire pas ce statut.
- Un épisode est vu si au moins une de ses versions est vue. Il compte une seule fois dans la bibliothèque.
- La dernière position et le statut vu sont distincts : revoir un épisode peut ramener la position à zéro sans annuler le premier visionnage.
- Une saison est terminée automatiquement uniquement si son périmètre d’épisodes est connu et complet et si tous ces épisodes sont vus. Un nombre annoncé seul ne suffit pas lorsque la correspondance de numérotation est incertaine.
- Un total MAL égal à zéro est converti en total inconnu, jamais en saison vide terminée.

Il n’existe pas de statut métier local En pause ou Abandonné : une saison commencée mais incomplète reste en cours, sans déduction liée à l’inactivité. Ces statuts ne sont pas préservés sur MAL : un nouvel épisode vu y repasse l’anime « En cours ».

Les corrections manuelles futures seront des décisions explicites versionnées. Une simple fusion par « vu OU vu » ne peut pas gérer une correction vers non vu ; cette fonctionnalité nécessitera des opérations dédiées.

## 3. Correspondances avec MyAnimeList

Les identifiants MAL sont externes. Une fiche MAL peut représenter une saison, une partie de saison, un film ou un spécial. La relation n’est donc pas obligatoirement un identifiant MAL unique sur l’anime, ni même sur la saison.

Une correspondance de catalogue contient : fournisseur, identifiant externe, entité interne cible, périmètre d’épisodes, statut (proposé/confirmé/rejeté), méthode et date de validation. La correspondance des épisodes indique explicitement le numéro local vers le numéro de progression MAL. Les cas fractionnés utilisent plusieurs correspondances ; aucun décalage n’est supposé sans vérification.

Ordre de résolution :

1. Réutiliser la correspondance source déjà enregistrée.
2. Rechercher les titres et alias, puis vérifier saison, type et informations disponibles.
3. Garder les rapprochements ambigus en attente, sans interrompre le suivi.
4. Demander une confirmation ponctuelle lorsque nécessaire et mémoriser la réponse.

Le premier résultat de recherche n’est pas automatiquement le bon. Les relations de préquelle/suite aident au rapprochement mais ne suffisent pas à définir une famille ou un numéro de saison.

Les métadonnées externes restent séparées des données personnelles : titre de catalogue, alias, synopsis, image, provenance et date de récupération. Les noms observés sur le site restent conservés. Les images utilisent un cache local et un remplacement visuel en cas d’absence ; leur conservation et leur actualisation doivent respecter les conditions du fournisseur.

## 4. Correspondances proposées pour la sauvegarde

Les 11 fiches et leurs affiches ont été vérifiées par l’API. Les rattachements ci-dessous sont proposés d’après les titres et alias ; la numérotation épisode par épisode n’a pas encore été validée sur le site.

| Clé Voiranime                                                         | Fiche MAL | Saison proposée |
| --------------------------------------------------------------------- | --------- | --------------- |
| a-wild-last-boss-appeared-2                                           | 63140     | 2               |
| boku-no-hero-academia-6                                               | 49918     | 6               |
| clevatess-2                                                           | 62513     | 2               |
| full-clearing-another-world-under-a-goddess-with-zero-believers       | 63292     | 1               |
| gachiakuta                                                            | 59062     | 1               |
| goodbye-dragon-life-hello-human-life                                  | 58445     | 1               |
| overgeared                                                            | 64340     | 1               |
| reborn-as-a-space-mercenary-i-woke-up-piloting-the-strongest-starship | 60948     | 1               |
| sentenced-to-be-a-hero                                                | 56009     | 1               |
| witch-hat-atelier                                                     | 51553     | 1               |
| youjo-senki-2                                                         | 49233     | 2               |

Les saisons absentes de la sauvegarde ne sont ni ajoutées comme vues ni nécessaires pour afficher la saison suivie.

## 5. Historique des versions

La migration depuis la 0.3.6 a été retirée. Les lectures intégrées à la V1 conservent leurs identifiants.

## 6. Synchronisation facultative vers MAL

Cette fonctionnalité est incluse dès la V1 du produit. Seule son activation par l’utilisateur est facultative. La première livraison couvre AnimeTrace vers MAL ; l’import de liste MAL et la synchronisation bidirectionnelle complète restent différés.

La connexion utilise OAuth ; les jetons restent hors des exports, du catalogue et du suivi partagé. La synchronisation MAL est distincte de la synchronisation entre appareils.

Avant tout envoi : connexion explicite, correspondance confirmée et lecture de l’état distant. Une file locale mémorise les mises à jour à réessayer après une panne.

La progression exportable est le préfixe continu d’épisodes vus dans la numérotation MAL validée, en tenant compte du point de départ MAL existant. Par exemple, MAL à 8 puis l’épisode 9 vu permet d’envoyer 9. Des épisodes 6 à 10 seuls ne prouvent pas que 1 à 5 sont vus. Si MAL indique zéro et que seul l’épisode 9 est détecté, une confirmation ponctuelle demande si les précédents sont vus. La réponse est mémorisée avec sa provenance, sans inventer d’horodatages de lecture. Une absence de réponse ne vaut pas confirmation. Cette lecture du compteur distant ne constitue pas un import complet de liste MAL.

Ne jamais additionner aveuglément les compteurs local et distant, ni compter deux fois VF/VOSTFR, ni diminuer automatiquement le compteur MAL. Un écart explicable par de nouvelles lectures n’est pas un conflit. Une baisse manuelle détectée sur MAL ou une divergence ambiguë suspend uniquement l’écriture de l’anime concerné jusqu’à résolution ; le suivi local et les autres synchronisations continuent. Un revisionnage ne retire pas le statut vu et ne remet pas automatiquement MAL à zéro.

Préserver la note MAL en n’écrivant jamais ce champ. Les statuts MAL En pause et Abandonné ne sont pas préservés : un nouvel épisode vu repasse l’anime « En cours ». Une saison incomplètement identifiée ne devient pas terminée sur MAL. Les lectures des états distants et les derniers envois confirmés doivent permettre de distinguer les nouvelles lectures des modifications manuelles concurrentes ; les détails du protocole restent à implémenter.

## 7. Conséquences pour l’interface

- La bibliothèque affiche les animes ; leur détail présente saisons, épisodes et versions.
- « Catalogue à associer » et « Synchronisation en attente » sont des états indépendants de « En cours » et « Vu ».
- Un ancien lien indisponible ne masque pas les épisodes déjà enregistrés.
- Une confirmation de correspondance affiche le titre, la saison et l’affiche proposés.
- La position appartient à la lecture ; un changement de source n’annonce pas une reprise automatique à la seconde tant que celle-ci n’est pas implémentée.

## 8. Vérifications requises avant livraison

Réimport de sauvegarde V1 sans doublon, changement de domaine sans duplication, coexistence VF/VOSTFR, saison inconnue, épisode spécial, saison divisée en plusieurs fiches MAL, panne catalogue, total inconnu, lectures concurrentes, synchronisation cloud et conflit avec une modification manuelle MAL.
