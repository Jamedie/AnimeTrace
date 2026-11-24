# AnimeTrace — Fonctionnalités et vision produit

Référence fonctionnelle de la refonte, mise à jour le 17 novembre 2026.

## 1. Pourquoi AnimeTrace existe

AnimeTrace est d’abord un outil personnel pour Jimmy. Les sites de streaming ferment et rouvrent rapidement, parfois sous une nouvelle adresse, mais l’historique de visionnage ne suit pas toujours. Maintenir une liste MyAnimeList à la main demande un effort que l’extension doit supprimer.

**Promesse : regarder normalement et conserver automatiquement la mémoire de ses animes et de sa progression, indépendamment des changements d’adresse du site.**

La disponibilité du streaming n’est pas le problème principal : le site revient généralement dans l’heure. La priorité est la continuité de l’historique, sans saisie quotidienne.

AnimeTrace ne fournit ni n’héberge de vidéos. Les liens ouvrent la source de lecture.

## 2. Lecture des statuts

- **Existant** : disponible dans la version 0.3.6 décrite et déclarée fonctionnelle par l’utilisateur.
- **Prévu** : retenu comme cible de la refonte, sans être encore implémenté.
- **À préciser** : besoin ou règle proposé, dont les modalités restent à définir.
- **Différé** : évoqué, mais hors du premier périmètre de refonte.

La refonte UI/UX est menée avec un autre agent. Ce document définit les comportements attendus ; il ne fige pas les maquettes.

### Périmètre de la V1

La V1 rassemble les fonctionnalités prévues pour la refonte, y compris la synchronisation facultative du compte MyAnimeList dès sa première livraison. Le POC fonctionnel reste utilisable pendant la préparation de cette version complète.

- Suivi automatique et historique durable malgré les changements de domaine pris en charge.
- Nouvelle bibliothèque organisée par anime, saison, épisode et version de lecture.
- Catalogue et affiches MyAnimeList, avec gestion des associations incertaines.
- Synchronisation entre ordinateurs.
- Export et import de l’historique AnimeTrace V1.
- Connexion MAL facultative et synchronisation **AnimeTrace → MyAnimeList**, avec gestion des pannes et des conflits.

« Facultative » signifie que l’utilisateur choisit de connecter son compte ; la fonctionnalité fait bien partie de la V1 et n’est pas repoussée à une livraison suivante. Les éléments explicitement différés dans ce document restent hors V1, notamment l’import de liste MAL et la synchronisation bidirectionnelle complète.

## 3. Détection et suivi automatique

### Existant à conserver

- Reconnaître les pages d’épisodes Voiranime prises en charge.
- Enregistrer le titre, le numéro d’épisode, la version VF/VOSTFR, l’URL et la date de consultation.
- Distinguer une page ouverte d’une lecture réellement commencée.
- Détecter la lecture des vidéos HTML sur les pages et lecteurs autorisés.
- Enregistrer la position et la durée pendant la lecture, au plus toutes les cinq secondes, ainsi qu’au lancement, à la pause et à la fin.
- Séparer les lectures effectuées dans plusieurs onglets.
- Ne pas compter le simple chargement de métadonnées à la position zéro comme un visionnage.
- Marquer un épisode vu à 90 % de sa durée ou à la fin de la vidéo.
- Conserver le statut vu après réouverture ou retour en arrière.
- Enregistrer localement même lorsque le cloud est inaccessible.

### Prévu

- Continuer à enregistrer un anime même si le catalogue ne le reconnaît pas ou ne répond pas.
- Rattacher ultérieurement une lecture à la bonne fiche sans perdre sa progression.
- Conserver les progressions par version et source lorsque les durées ou montages diffèrent.

## 4. Historique indépendant des sites

### Prévu — priorité centrale

- Donner une identité interne durable aux animes, saisons, épisodes et versions de lecture.
- Conserver les données même si un site ferme ou si ses liens deviennent inutilisables.
- Séparer le site logique de ses domaines successifs.
- Reconnaître un contenu déjà connu sur un nouveau domaine pris en charge, lorsque ses clés de contenu restent stables.
- Associer les nouvelles lectures au même historique sans créer de doublons.
- Mémoriser plusieurs adresses pour un même contenu.
- Si le site modifie également ses titres ou ses identifiants, proposer un rapprochement avec la bibliothèque.
- Mémoriser une confirmation pour ne pas la redemander à chaque lecture.
- Ne pas fusionner automatiquement deux contenus sur la seule ressemblance de leur titre.

### Connecteurs de sites — validé pour la V1

La détection propre à chaque site est isolée dans un **connecteur**, séparé du cœur de l’extension :

- Le cœur (historique, bibliothèque, synchronisations, MAL) ne connaît aucune adresse ni structure de page.
- Chaque connecteur déclare ce qu’il reconnaît (forme des liens, pages d’épisode, lecteurs vidéo) et renvoie au cœur des informations normalisées : identifiant du contenu sur le site, titre, numéro d’épisode, version de lecture, adresse.
- Ajouter un site ou adapter Voiranime après un changement de présentation revient à ajouter ou modifier un connecteur, livré par une mise à jour de l’extension, sans toucher au reste.
- La V1 livre un seul connecteur : Voiranime.

Les sites d’anime n’ont pas une structure commune : chaque nouveau site demande son propre connecteur. Le code des connecteurs est livré avec l’extension ; leur téléchargement à distance n’est pas prévu (les règles des extensions Manifest V3 interdisent le code distant).

### Nouveau domaine d’un site pris en charge — validé pour la V1

1. Sur la nouvelle adresse, l’utilisateur clique sur l’icône d’AnimeTrace, ce qui autorise l’examen de la page affichée uniquement.
2. AnimeTrace demande aux connecteurs si la page correspond à un site connu.
3. Si oui : « Cette adresse ressemble à Voiranime. Activer le suivi ici ? ». Sinon : « Site non pris en charge », rien n’est enregistré.
4. Après acceptation, Brave demande une fois l’autorisation pour ce domaine, ainsi que pour un éventuel lecteur vidéo inconnu.
5. Le suivi reprend ; les contenus sont reconnus par leurs identifiants, l’historique continue sans doublon et la bibliothèque ouvre les épisodes sur l’adresse la plus récente. Les anciennes adresses restent mémorisées.

Règles associées :

- Aucune activation silencieuse ; pas d’accès permanent à tous les sites.
- Les domaines activés sont synchronisés entre ordinateurs ; l’autorisation Brave reste à accepter sur chacun.
- Si le site change aussi ses titres ou identifiants, le rapprochement proposé et mémorisé s’applique.
- La règle réseau des affiches liée au domaine disparaît, les affiches venant de MAL.
- Une page de même structure sur un autre site peut passer la vérification : la confirmation de l’utilisateur et la correspondance des identifiants limitent ce risque.

Non vérifié : parcours d’autorisation dans Brave et stabilité de la forme des liens lors des déménagements passés de Voiranime.

### À préciser

- Présentation et correction des rapprochements ambigus.

La conservation de l’historique ne signifie pas que l’extension sait retrouver automatiquement une nouvelle adresse de streaming. Cette recherche automatique n’est pas comprise dans le premier périmètre.

## 5. Organisation de la bibliothèque

### Hiérarchie prévue

**Anime → saison → épisode → version de lecture.**

- Un anime regroupe ses saisons.
- Une saison regroupe ses épisodes.
- Un épisode peut avoir plusieurs versions, notamment VF et VOSTFR.
- Les liens des sites sont associés aux versions ; ils ne définissent pas l’identité de l’épisode.
- VF et VOSTFR ne comptent pas deux fois dans le nombre d’épisodes vus.
- Films, OAV et épisodes spéciaux utilisent des regroupements adaptés.
- Une saison inconnue reste indiquée comme inconnue plutôt que d’être devinée.
- Une saison divisée en plusieurs parties de catalogue doit pouvoir être représentée sans perdre la hiérarchie interne.

### Existant à conserver

- Bibliothèque accessible dans un onglet de l’extension.
- Regroupement des épisodes par anime, recherche par titre et tri par activité récente.
- Filtres Tous, Commencés et Seulement consultés.
- Compteurs d’animes découverts, d’animes commencés et d’épisodes vus.
- Mise à jour de l’affichage après modification de l’historique local ou synchronisé.
- Cartes avec titre, affiche ou remplacement visuel, statut et nombre d’épisodes vus.
- Accès au détail des épisodes, avec numéro, langue, statut et position/durée disponibles.
- Ouverture des liens de lecture depuis les détails.

### Présentation actuelle à prendre en compte

- Titres limités à deux lignes sur les cartes, avec titre complet au survol.
- Les cartes actuelles n’affichent plus le bouton Continuer/Revoir, la dernière lecture ni la barre de progression, selon le choix utilisateur précédent.
- La fiche d’épisodes se ferme par bouton, Échap ou clic sur le fond ; un glissement commencé dans la fiche ne doit pas la fermer.
- Le lien Nautiljon actuel lance une recherche par titre, sans association automatique à une fiche.

Le maintien exact de ces choix visuels et la place du lien Nautiljon restent à coordonner avec la nouvelle UI ; le catalogue principal retenu pour la refonte est MyAnimeList.

## 6. États et progression

### Existant

- **Consulté / page ouverte** : page détectée sans lecture réelle.
- **En cours** : lecture commencée, épisode non terminé.
- **Vu** : seuil de 90 % atteint ou fin de lecture détectée.
- Progression et statut vu séparés : revoir un épisode ne retire pas le fait qu’il a déjà été vu.

### Prévu

- Calculer les états au bon niveau : version, épisode et saison.
- Déduire une saison terminée seulement si le périmètre complet et la correspondance des épisodes sont connus et tous les épisodes requis vus.
- Traiter un total inconnu comme inconnu, notamment lorsque MAL renvoie zéro.
- Ne pas considérer les épisodes précédents comme vus parce qu’un épisode plus avancé a été détecté.
- Distinguer le statut de lecture des états techniques : catalogue à associer, synchronisation en attente, erreur ou lien indisponible.

Le statut global d’un anime comportant des saisons futures ne doit pas être déduit automatiquement de la seule dernière saison connue ; sa présentation reste à définir.

AnimeTrace n’a pas de statuts manuels « En pause » ou « Abandonné », ni de filtres associés. Une saison commencée et non terminée reste simplement en cours, quelle que soit la durée d’inactivité. Sur MAL, ces statuts ne sont pas préservés : un nouvel épisode vu repasse l’anime « En cours ».

## 7. Catalogue et affiches MyAnimeList

### Prévu

- Utiliser MyAnimeList comme catalogue principal pour les fiches et les affiches.
- Rechercher à partir du titre observé et de ses variantes connues.
- Récupérer les titres alternatifs, les informations de fiche, le synopsis et le nombre d’épisodes lorsqu’ils sont disponibles.
- Vérifier la saison ou la partie concernée avant d’enregistrer une correspondance.
- Ne pas sélectionner systématiquement le premier résultat de recherche.
- Conserver les identifiants MAL comme références externes, séparées des identifiants AnimeTrace.
- Prévoir plusieurs correspondances lorsqu’une saison interne couvre plusieurs fiches MAL.
- Garder les noms et informations observés sur le site avec leur provenance.
- Utiliser un cache d’images local et un remplacement visuel si une affiche est absente.
- Afficher les informations déjà disponibles et poursuivre le suivi lorsque le catalogue est inaccessible.
- Permettre un changement futur de fournisseur sans perdre l’historique personnel.

### Validation réalisée

- Application AnimeTrace enregistrée chez MyAnimeList.
- Accès à l’API catalogue testé en lecture seule.
- Les 11 titres de la sauvegarde fournie ont une correspondance proposée dans MAL.
- Les 11 affiches correspondantes ont été récupérées avec succès.
- La correspondance automatique de chaque épisode du site reste à implémenter et à vérifier.

IMDb et TMDB ont été étudiés ; AniList a également été envisagé. Aucun de ces services supplémentaires n’est intégré au périmètre actuel. L’accès MAL est actuellement gratuit selon ses conditions, qui restent applicables à l’utilisation et à la conservation de ses données.

## 8. Synchronisation facultative du compte MyAnimeList

### Prévu dès la V1

- Connecter volontairement son compte MAL via son mécanisme d’autorisation.
- Utiliser AnimeTrace sans compte MAL si souhaité.
- Mettre à jour automatiquement la progression de la liste MAL à partir des lectures reconnues.
- Première direction : **AnimeTrace → MyAnimeList**.
- Envoyer un statut En cours ou Terminé uniquement lorsque les règles et les correspondances le permettent.
- Conserver dans AnimeTrace le détail qui ne se résume pas au compteur MAL : épisodes observés, versions, positions et liens.
- Reporter les mises à jour après une panne, sans bloquer le suivi local.
- Lire l’état distant avant une mise à jour et éviter d’écraser une progression existante.
- Ne pas additionner aveuglément les compteurs ni compter deux fois VF/VOSTFR.
- Préserver la note MAL. Les statuts En pause et Abandonné ne sont pas préservés : un nouvel épisode vu repasse l’anime « En cours » sur MAL.
- Suspendre une écriture ambiguë et rendre le conflit compréhensible.

### Règles validées pour la V1

- Exporter une progression continue dont les épisodes précédents sont connus comme vus ; un épisode isolé ne prouve pas que les précédents ont été regardés.
- Utiliser la progression MAL existante comme point de départ, sans inventer de dates de visionnage locales : si MAL indique 8 épisodes vus, voir le 9 permet de passer à 9.
- Si seul l’épisode 9 est détecté alors que MAL indique zéro, demander une fois si les épisodes précédents ont été vus. Mémoriser la réponse ; sans confirmation, ne pas supposer les épisodes manquants vus.
- Ne jamais diminuer automatiquement le compteur MAL.
- Une baisse manuelle sur MAL ou un autre conflit inhabituel suspend uniquement la synchronisation de l’anime concerné jusqu’au choix utilisateur. Le suivi local et les autres synchronisations continuent.
- Un revisionnage conserve le statut vu acquis et une position de lecture distincte. Il ne déclenche pas automatiquement une remise à zéro sur MAL.
- Les pannes réseau mettent les mises à jour en attente, puis les réessaient au retour du réseau.

La reconnaissance réutilise une association connue ; pour un nouveau titre, elle vérifie saison et format. En cas d’ambiguïté, la lecture est conservée immédiatement et une confirmation ponctuelle reste disponible. Un changement de domaine conserve l’association lorsque les clés du contenu restent identiques et que le domaine est pris en charge.

### Différé

- Import de la liste MAL existante.
- Synchronisation bidirectionnelle complète.

La connexion OAuth et l’écriture dans une liste MAL n’ont pas encore été testées. Aucun compte utilisateur n’a été modifié pendant la validation du catalogue.

## 9. Synchronisation entre ordinateurs

### Existant à conserver

- Stockage local persistant et synchronisation facultative par Supabase.
- Connexion par e-mail et mot de passe au compte configuré.
- Utilisation du même projet et du même compte sur les appareils concernés.
- Synchronisation périodique, à l’ouverture des interfaces prévues et sur action manuelle.
- Renouvellement de session et affichage des erreurs.
- Déconnexion sans suppression de l’historique local.
- Fusion conservant les épisodes de chaque machine et les statuts vus.
- Une simple consultation ne remplace pas une vraie progression de lecture.

### Prévu

- Adapter la synchronisation à la nouvelle hiérarchie et aux identifiants internes.
- Éviter les doublons quand plusieurs appareils migrent les mêmes données.
- Préserver les lectures concurrentes et rendre les réessais sans effet supplémentaire.
- Séparer clairement l’état du cloud AnimeTrace de celui de la synchronisation MAL.

La validation réelle PC/Mac reste à réaliser. Le changement de compte ou de projet n’est pas pris en charge dans l’interface actuelle ; son évolution n’a pas été retenue pour le premier périmètre.

## 10. Sauvegarde et import

### Réalisé dans la V1

- Réglages → Sauvegarde : « Exporter mon historique » (fichier `animetrace-sauvegarde-AAAA-MM-JJ.json` : bibliothèque et associations MAL confirmées ou refusées, sans session ni mot de passe).
- « Importer un fichier… » : accepte les sauvegardes AnimeTrace V1. Fusion sans suppression (vu cumulatif, progression la plus récente, adresses déjà connues prioritaires, choix MAL faits sur l’ordinateur conservés) ; réimport sans doublon ; rapport ajoutés / complétés / déjà à jour.
- Les épisodes importés partent vers les autres ordinateurs par le cloud.

## 11. Popup et réglages

### Existant à conserver

- Popup depuis la barre du navigateur avec les épisodes récents et leurs états.
- Position, durée et barre de progression lorsqu’elles sont connues.
- Accès à la bibliothèque, aux réglages, à la synchronisation et à l’export.
- Réglages du compte et du projet Supabase, connexion et déconnexion.

### Prévu pour la refonte UI/UX

- Navigation cohérente entre bibliothèque, saisons, épisodes et versions.
- Accès à la connexion MAL facultative et à son état de synchronisation.
- Présentation d’une proposition de correspondance avec titre, saison et affiche.
- Historique consultable même si les sources ou le catalogue sont indisponibles.
- Messages distinguant absence de lecture, absence de catalogue, panne réseau et conflit de synchronisation.

## 12. Plateforme et confidentialité

- Extension Chromium Manifest V3, utilisée avec Brave sur Windows et macOS.
- Interface en français ; popup et pages locales de bibliothèque/réglages.
- Fonctionnement local sans serveur web nécessaire pour héberger l’interface.
- Aucun transfert de flux vidéo par AnimeTrace.
- Aucun service publicitaire ou d’analyse d’audience intégré à la version actuelle.
- Historique personnel séparé des métadonnées de catalogue et des informations de connexion.
- Identifiants de connexion et jetons exclus des exports, des documents et du dépôt.
- Permissions limitées aux fonctionnalités et domaines pris en charge.

La politique de confidentialité devra refléter l’intégration MAL avant sa distribution. L’installation manuelle et les archives Chrome Web Store existent ; une capture du store indiquait la version 0.3.5 en attente d’examen. La publication finale n’a pas été confirmée.

## 13. Évolutions évoquées mais différées

- Ajouter un anime depuis la simple consultation de sa fiche générale.
- Ajout manuel d’animes et liste À voir.
- Corriger ou supprimer manuellement des épisodes dans l’interface.
- Notes personnelles et marquage manuel Terminé. Les statuts locaux En pause et Abandonné sont exclus du besoin actuel, et non des fonctionnalités à ajouter ultérieurement par défaut.
- Recommandations, fonctions sociales et catalogue exhaustif à parcourir.
- Import de la liste MAL et synchronisation dans les deux sens.
- Connecteurs pour d’autres sites et lecteurs.
- Recherche automatique d’une nouvelle source ou d’un nouveau domaine.
- Reprise automatique de la vidéo à la seconde enregistrée.
- Application mobile, TV ou site web autonome.
- Récupération automatique de l’historique antérieur à l’installation.
- Réinitialisation du mot de passe cloud depuis l’extension.

Ces éléments ne sont pas des fonctionnalités promises pour la première version refondue. La correction d’une association de catalogue est distincte de l’édition complète de l’historique.

## 14. Scénarios de référence

1. **Lecture habituelle** : ouvrir un épisode et le regarder suffit pour enregistrer sa progression.
2. **Changement d’adresse** : après prise en charge du nouveau domaine, retrouver le même anime et poursuivre l’historique sans doublon.
3. **Catalogue indisponible** : continuer à enregistrer la lecture et associer la fiche ultérieurement.
4. **Version différente** : regarder en VF après la VOSTFR conserve des progressions distinctes, mais un seul épisode vu dans le compteur.
5. **Association incertaine** : confirmer une fois la bonne saison et réutiliser cette correspondance.
6. **Changement d’ordinateur** : retrouver les lectures synchronisées sans perdre les données locales.
7. **Compte MAL connecté** : mettre à jour les lectures reconnues sans saisie quotidienne ni écrasement des choix manuels.
8. **Restauration** : importer une sauvegarde, vérifier le résultat et conserver les progressions sans doublon.

## 15. Références

- [Modèle de données](MODELE-DONNEES.md) : identités, correspondances et règles techniques proposées.
- [API officielle MyAnimeList](https://myanimelist.net/apiconfig/references/api/v2).
- [Autorisation MyAnimeList](https://myanimelist.net/apiconfig/references/authorization).
- [Conditions de l’API MyAnimeList](https://myanimelist.net/static/apiagreement.html).

Le résumé historique FONCTIONNALITES.md fourni pour la version 0.3.6 décrit l’existant. Le présent document consolide cet existant et les choix de refonte discutés ensuite, sans présenter les fonctions prévues comme déjà livrées.
