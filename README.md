# ft_transcendence

`ft_transcendence` est une application web temps réel autour d'un Pong 3D, développée en TypeScript avec une architecture microservices. Le projet combine authentification JWT, 2FA, OAuth Google/42, jeu WebSocket, matchmaking, tournois, profils, statistiques, chat social et reverse proxy HTTPS.

Le projet est conçu pour être lancé rapidement avec :

```bash
make
```

## Aperçu du projet

| Menu principal | Gameplay temps réel |
| --- | --- |
| ![Menu principal](docs/images/01-main-menu.png) | ![Gameplay temps réel](docs/images/05-gameplay.png) |

| Paramètres | Profil et statistiques |
| --- | --- |
| ![Paramètres](docs/images/02-settings.png) | ![Profil et statistiques](docs/images/04-profile-stats.png) |

| Victoire |
| --- |
| ![Ecran de victoire](docs/images/03-victory.png) |

## Démarrage rapide

```bash
make help        # affiche la bannière, les couleurs et les commandes
make env         # génère un .env local-demo
make check-env   # vérifie le .env et annonce les fonctions indisponibles
make up          # build et lance toute la stack Docker
```

Une fois lancé :

```text
https://localhost:8443
```

Le certificat HTTPS est auto-signé en local, il faut donc l'accepter dans le navigateur.

## Mode local-demo sans `.env` officiel

Le Makefile génère un `.env` utilisable pour lancer le projet localement, mais ce n'est pas un `.env` officiel avec de vrais secrets externes. Les secrets internes sont générés localement, tandis que les clés OAuth restent volontairement en placeholders.

Fonctionnalités indisponibles tant que les vraies clés ne sont pas renseignées :

- Connexion Google.
- Connexion 42.
- Validation réelle des callbacks OAuth Google/42.

Le reste de la stack peut être présenté : interface, jeu, WebSocket, profils, statistiques, chat, matchmaking et tournois selon les données locales.

## Stack technique

| Couche | Technologies | Fichiers principaux |
| --- | --- | --- |
| Frontend | Vite, TypeScript, BabylonJS | `frontend/src/main.ts`, `frontend/src/classes/Game.ts`, `frontend/src/classes/Network.ts` |
| Reverse proxy | Nginx, HTTPS, WebSocket proxy | `nginx/nginx.conf` |
| API Gateway | Fastify, cookies, JWT, proxy HTTP | `gateway/server.ts` |
| Auth | Fastify, SQLite, JWT, 2FA, OAuth | `auth-service/src/auth.routes.ts`, `auth-service/src/externalServicesAuth.ts` |
| Users | Fastify, SQLite, avatars, stats | `user-service/src/user-routes.ts`, `user-service/src/db.ts` |
| Chat | Fastify WebSocket, friendships, blocks | `chat-service/src/route.ts`, `chat-service/src/webSocketHandler.ts` |
| Matchmaking | Fastify, SQLite, games, tournaments | `matchmaking-service/src/matchmaking-routes.ts`, `matchmaking-service/src/db.ts` |
| Game server | Node WebSocket, rooms, physics | `server/src/server.ts`, `server/src/Rooms.ts`, `server/src/Room.ts`, `server/src/Gamelogic.ts` |

## Architecture globale

```mermaid
flowchart LR
    Browser["Navigateur<br/>Frontend + cookies"] --> Nginx["Nginx HTTPS<br/>:8443"]

    Nginx --> Frontend["frontend<br/>Vite :5173"]
    Nginx --> Gateway["gateway<br/>Fastify :3000"]
    Nginx --> GameWs["game-server<br/>WebSocket /game-ws :3005"]

    Gateway --> Auth["auth-service<br/>:3001"]
    Gateway --> Users["user-service<br/>:3002"]
    Gateway --> Chat["chat-service<br/>:3004"]
    Gateway --> Matchmaking["matchmaking-service<br/>:3003"]

    GameWs --> Matchmaking
    GameWs --> Users
    Chat --> Auth
    Chat --> Users
```

Ce schéma vient directement de `docker-compose.yml`, `nginx/nginx.conf` et `gateway/server.ts`.

## Routage et sécurité HTTP

Le gateway centralise la sécurité applicative. Il lit le cookie `access_token`, vérifie le JWT avec `JWT_SECRET`, ajoute `x-user-id` et `x-username`, puis proxifie vers le service concerné.

```mermaid
flowchart TD
    Req["Requête HTTPS"] --> Nginx["nginx.conf"]
    Nginx --> Route{"Route ?"}

    Route -->|/auth/*| GatewayAuth["gateway /auth"]
    Route -->|/users/*| GatewayUsers["gateway /users"]
    Route -->|/chat/*| GatewayChat["gateway /chat"]
    Route -->|/matchmaking/*| GatewayMatch["gateway /matchmaking"]
    Route -->|/game-ws| GameWS["game-server WebSocket"]
    Route -->|/| Frontend["frontend SPA"]

    GatewayAuth --> Public{"Route publique ?"}
    GatewayUsers --> Jwt["Vérification JWT cookie"]
    GatewayChat --> Jwt
    GatewayMatch --> Jwt

    Public -->|login, signup, refresh, OAuth| Auth["auth-service"]
    Jwt --> Headers["Injection x-user-id / x-username"]
    Headers --> Users["user-service"]
    Headers --> Chat["chat-service"]
    Headers --> Matchmaking["matchmaking-service"]
```

Routes publiques définies dans `gateway/server.ts` :

- `/auth/login`
- `/auth/signup`
- `/auth/refresh`
- `/auth/google`
- `/auth/google/callback`
- `/auth/42`
- `/auth/42/callback`
- `/auth/providers`
- `/health`

Préfixes protégés par JWT :

- `/users`
- `/game`
- `/chat`
- `/matchmaking`

## Authentification

Le service d'authentification gère signup, login, 2FA, refresh token, logout, statut de session, changement de mot de passe, suppression de compte et OAuth.

```mermaid
sequenceDiagram
    actor User as Utilisateur
    participant Front as Frontend
    participant Gateway as Gateway
    participant Auth as Auth service
    participant AuthDB as SQLite auth
    participant UserSvc as User service
    participant ChatSvc as Chat service

    User->>Front: Login ou signup
    Front->>Gateway: POST /auth/login ou /auth/signup
    Gateway->>Auth: Proxy /login ou /signup
    Auth->>AuthDB: Vérifie ou crée le compte

    alt 2FA activée
        Auth-->>Front: challengeToken
        User->>Front: Code TOTP
        Front->>Gateway: POST /auth/2fa/verify
        Gateway->>Auth: Validation du challenge
    end

    Auth->>UserSvc: POST /sync
    Auth->>ChatSvc: POST /users
    Auth-->>Front: Cookies access_token + refresh_token
```

Flux OAuth dans `auth-service/src/externalServicesAuth.ts` :

```mermaid
sequenceDiagram
    actor User as Utilisateur
    participant Front as Frontend
    participant Auth as Auth service
    participant Provider as Google ou 42
    participant AuthDB as SQLite auth
    participant UserSvc as User service
    participant ChatSvc as Chat service

    User->>Front: Clique Google ou 42
    Front->>Auth: GET /auth/google ou /auth/42
    Auth->>Provider: Redirection OAuth
    Provider-->>Auth: Callback avec code
    Auth->>Provider: Echange code contre token
    Auth->>Provider: Récupère profil externe
    Auth->>AuthDB: findOrCreateOAuthUser()
    Auth->>UserSvc: syncUserWithUserService()
    Auth->>ChatSvc: syncUserWithChatService()
    Auth-->>Front: Cookies JWT puis redirect
```

## Jeu simple en WebSocket

Le frontend ouvre `/game-ws` via `frontend/src/main.ts`, puis envoie des messages gérés par `server/src/server.ts`. Le serveur crée ou rejoint une `Room`, persiste l'état de matchmaking, attend que les deux joueurs soient prêts, puis démarre `Gamelogic`.

```mermaid
sequenceDiagram
    actor P1 as Joueur 1
    actor P2 as Joueur 2
    participant Front as Frontend Network.ts
    participant GameServer as server.ts
    participant Rooms as Rooms.ts
    participant Room as Room.ts
    participant Logic as Gamelogic.ts
    participant MatchDB as matchmaking-service
    participant UserSvc as user-service

    P1->>Front: Play
    Front->>GameServer: WS roomrequest
    GameServer->>Rooms: joinRoom()
    alt aucune room compatible
        Rooms->>MatchDB: POST /games via createGameinDb()
        Rooms->>Room: Room.create()
        Room-->>P1: message room
    end

    P2->>Front: Play
    Front->>GameServer: WS roomrequest ou joinroom
    GameServer->>Rooms: joinRoom()
    Rooms->>MatchDB: PUT /games/:id/join
    Room-->>P1: camera
    Room-->>P2: camera

    P1->>GameServer: WS ready
    P2->>GameServer: WS ready
    Room->>Logic: new Gamelogic(players)

    loop toutes les 50ms
        Logic->>Logic: updatePlayers()
        Logic->>Logic: PhysicsLoop()
        Logic-->>Front: stateframe
    end

    Logic-->>Room: endGame(winnerId)
    Room->>UserSvc: PUT /:id/game
    Room->>MatchDB: leave / destroy game
    Room-->>Front: gamestate end
```

Messages WebSocket principaux côté jeu :

| Message | Origine | Fonction appelée |
| --- | --- | --- |
| `roomrequest` | Frontend | `Server.handleClientMessage()` puis `Rooms.joinRoom()` ou `Rooms.createRoom()` |
| `joinroom` | Frontend | `Rooms.joinRoom(player, false, roomid)` |
| `directconnection` | Frontend | `Rooms.directconnection()` ou `Tournament.directConnection()` |
| `ready` | Frontend | `Rooms.setPlayerReady()` ou `Tournament.setPlayerReady()` |
| `leavegame` | Frontend | `Rooms.leaveRoom()` |
| `stateframe` | Serveur | envoyé par `Gamelogic.broadcastplayers()` |
| `score` | Serveur | callback `setUpdateScoreCallback()` |
| `gamestate end` | Serveur | envoyé par `Rooms.sendEndGameToPlayers()` |

## Tournois

Le tournoi est piloté côté game-server par `Tournament.ts` et persiste son état dans `matchmaking-service`. Les rounds sont représentés par des `Rooms`, et le bracket est sauvegardé sous forme JSON.

```mermaid
flowchart TD
    Create["WS createTournament"] --> DbCreate["POST /matchmaking/tournaments"]
    DbCreate --> Tournament["new Tournament()"]
    Tournament --> Wait["waitingPlayers()"]
    Wait --> Full{"Nombre de joueurs atteint ?"}
    Full -->|non| Invite["joinTournament / addPlayer()"]
    Invite --> Wait
    Full -->|oui| Bracket["sendTournamentBracketInfo()"]
    Bracket --> SaveBracket["PUT /tournaments/:id/bracket"]
    SaveBracket --> Status["PUT /tournaments/:id/status = in_progress"]
    Status --> Round["initRound(round)"]
    Round --> Match["createMatchForPlayers()"]
    Match --> Room["Room + Gamelogic"]
    Room --> Winner["updateTournamentWinnerinDb()"]
    Winner --> Complete{"Round terminé ?"}
    Complete -->|non| Round
    Complete -->|oui, round suivant| Round
    Complete -->|oui, finale| Finish["changeState(finished)"]
    Finish --> Stats["PUT /users/:id/tournament"]
    Finish --> Destroy["destroyTournamentinDb()"]
```

Gestion des déconnexions en tournoi :

```mermaid
sequenceDiagram
    participant T as Tournament.ts
    participant P as Player
    participant WS as WebSocket
    participant DB as Matchmaking DB

    T->>P: vérifie WebSocket ouvert
    alt joueur déconnecté
        T-->>P: waitingForPlayer
        T->>WS: attend reconnexion 30s
        alt reconnexion
            WS-->>T: updatePlayerWebSocket()
            T->>T: createMatchForPlayers()
        else timeout
            T->>T: victoire par forfait
            T->>DB: PUT /tournaments/:id/bracket
            T-->>P: updateTournament forfeit
        end
    else deux joueurs connectés
        T->>T: createMatchForPlayers()
    end
```

## Chat et social

Le chat combine une API HTTP pour amis/blocages et un WebSocket pour les messages et invitations. Le WebSocket `/chat/ws` vérifie le JWT depuis les cookies, connecte l'utilisateur dans `ConnectionManager`, puis `webSocketHandler.ts` applique les règles métier.

```mermaid
flowchart TD
    ChatWS["/chat/ws"] --> Cookie["parse cookie access_token"]
    Cookie --> Jwt["jwt.verify()"]
    Jwt --> Exists["getUserById()"]
    Exists --> Manager["ConnectionManager.add(userId, ws)"]
    Manager --> Status["auth-service /connection-status"]

    Message["message reçu"] --> Validate["validateUserId + validateMessage + sanitizeHtml"]
    Validate --> Friend{"areFriends() ?"}
    Friend -->|non| Error1["erreur: pas ami"]
    Friend -->|oui| Blocked{"isBlocked() ?"}
    Blocked -->|oui| Error2["erreur: bloqué"]
    Blocked -->|non| Online{"destinataire connecté ?"}
    Online -->|non| Error3["erreur: offline"]
    Online -->|oui| Send["manager.sendTo()"]
```

Routes sociales principales dans `chat-service/src/route.ts` :

| Route | Fonction |
| --- | --- |
| `POST /chat/users` | synchronise un utilisateur créé côté auth |
| `GET /chat/search` | recherche un utilisateur via `user-service` |
| `POST /chat/friends` | crée une invitation |
| `GET /chat/friends` | liste les amis acceptés |
| `PUT /chat/friends/:id_friendship` | accepte ou refuse une invitation |
| `DELETE /chat/friends/:friend` | supprime une relation |
| `POST /chat/block` | bloque un utilisateur |
| `DELETE /chat/block/:blocked_id` | débloque un utilisateur |
| `GET /chat/ws` | WebSocket messages, invitations jeu/tournoi |

## Profils, statistiques et avatars

Le `user-service` maintient l'état public du joueur : avatar, skin de moto, statistiques, keybinds, game/tournament courant et photo de profil. Les routes utilisent `x-user-id` injecté par le gateway.

```mermaid
flowchart LR
    Front["Frontend Settings/Profile"] --> Gateway["Gateway JWT"]
    Gateway --> UserSvc["user-service"]

    UserSvc --> Me["GET /users/me"]
    UserSvc --> Update["PUT /users/me"]
    UserSvc --> Stats["GET /users/stats"]
    UserSvc --> Search["GET /users/search"]
    UserSvc --> Picture["POST/PUT/DELETE /users/picture"]

    Picture --> Sharp["sharp resize 500x500 webp"]
    Sharp --> Volume["picture-db-data"]
    UserSvc --> UsersDB["user-db-data SQLite"]
    Nginx["nginx /picture/"] --> Volume
```

## Persistance

Chaque service garde son propre stockage. Cette séparation rend les responsabilités plus claires : identité, profil, social et matchmaking ne sont pas mélangés.

```mermaid
erDiagram
    AUTH_USERS {
        integer id PK
        text username
        text hashedPassword
        text email
        text twofa_secret
        integer twofa
        text oauth_provider
        text oauth_id
        integer is_connected
    }

    USER_USERS {
        integer id PK
        text username
        integer avatar
        integer bike
        integer gamesPlayed
        integer gamesWon
        integer tournamentPlayed
        integer tournamentWon
        text left
        text right
        integer currentGameID
        integer currentTournamentID
        text profilePicture
    }

    CHAT_USERS {
        integer id PK
    }

    FRIENDSHIPS {
        integer id PK
        integer user1_id FK
        integer user2_id FK
        integer sender
        text status
    }

    BLOCKS {
        integer id PK
        integer blocker_id FK
        integer blocked_id FK
    }

    GAMES {
        integer id PK
        integer powerups
        text player1
        text player2
        integer tournamentId
    }

    TOURNAMENTS {
        integer id PK
        integer maxPlayers
        integer powerUps
        text status
        integer currentRound
        integer winnerId
        text bracket
        text players
        integer creator
    }

    CHAT_USERS ||--o{ FRIENDSHIPS : friendship
    CHAT_USERS ||--o{ BLOCKS : block
    TOURNAMENTS ||--o{ GAMES : tournament_games
```

## Organisation du code

```text
ft_transcendence/
├── auth-service/          # login, signup, JWT, 2FA, OAuth
├── user-service/          # profils, stats, avatars, keybinds
├── chat-service/          # amis, blocages, messages WebSocket
├── matchmaking-service/   # games, tournaments, bracket SQLite
├── gateway/               # API Gateway, auth hook, proxy Fastify
├── frontend/              # Vite + TypeScript + BabylonJS
├── server/                # serveur WebSocket du jeu, rooms, physics
├── nginx/                 # reverse proxy HTTPS
├── scripts/               # génération du .env local-demo
├── docs/images/           # captures du projet
└── docker-compose.yml     # orchestration des services
```

## Commandes utiles

| Commande | Usage |
| --- | --- |
| `make` ou `make up` | génère `.env`, build et lance les conteneurs |
| `make env` | génère ou rafraîchit le `.env local-demo` |
| `make check-env` | vérifie le `.env` et affiche les fonctions désactivées |
| `make up-attached` | lance la stack avec les logs attachés |
| `make logs` | suit les logs de tous les services |
| `make ps` | liste les conteneurs |
| `make down` | arrête les conteneurs |
| `make fclean` | supprime conteneurs, images et volumes |

## Points forts à expliquer

- Architecture microservices avec responsabilités séparées.
- Gateway Fastify qui centralise JWT, cookies, CORS, rate limit et proxy.
- Jeu WebSocket avec rooms, reconnexion, ready state, score et boucle physique.
- Tournois persistés avec bracket JSON, rounds successifs et gestion des forfaits.
- Chat social avec amis, blocages, invitations et statut de connexion.
- Lancement simplifié par Makefile, `.env local-demo` et certificats HTTPS locaux.

## Limites connues du mode demo

Sans `.env` officiel, les clés OAuth sont des placeholders. Le projet affiche donc clairement que Google/42 sont indisponibles jusqu'à configuration de vraies clés. Pour une démonstration complète, remplacer dans `.env` :

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
FORTYTWO_CLIENT_ID
FORTYTWO_CLIENT_SECRET
```
Projet 42 - ft_transcendence
