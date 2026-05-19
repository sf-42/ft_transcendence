SHELL := /bin/bash

.DEFAULT_GOAL := up

RESET := \033[0m
BOLD := \033[1m
DIM := \033[2m
RED := \033[31m
GREEN := \033[32m
YELLOW := \033[33m
BLUE := \033[34m
MAGENTA := \033[35m
CYAN := \033[36m

HOST_IP ?= $(shell ./scripts/generate-env.sh --print-host-ip 2>/dev/null || echo 127.0.0.1)
HOST_FQDN ?= $(shell ./scripts/generate-env.sh --print-host-fqdn 2>/dev/null || echo localhost)

.PHONY: banner help env check-env up up-attached down restart address fclean aggressivecleanup re container logs userservice-logs gateway-logs gameserver-logs matchmaking-logs auth-logs chat-logs ps exec

define log_step
	@printf '%b\n' "$(BOLD)$(CYAN)==>$(RESET) $(1)"
endef

define log_ok
	@printf '%b\n' "$(BOLD)$(GREEN)✓$(RESET) $(1)"
endef

define log_warn
	@printf '%b\n' "$(BOLD)$(YELLOW)!$(RESET) $(1)"
endef

define print_addresses
	@printf '\n%b\n' "$(BOLD)$(GREEN)ft_transcendence est lancé$(RESET)"
	@printf '%b\n' "$(DIM)──────────────────────────$(RESET)"
	@printf '%b\n' "$(BOLD)Local:$(RESET)   https://localhost:8443"
	@if [ -n "$(HOST_IP)" ]; then \
		printf '%b\n' "$(BOLD)Réseau:$(RESET)  https://$(HOST_IP):8443"; \
		printf '%b\n' "$(BOLD)Hôte:$(RESET)    https://$(HOST_FQDN):8443"; \
	fi
	@printf '%b\n\n' "$(YELLOW)Accepte le certificat auto-signé dans ton navigateur.$(RESET)"
endef

define update_certs
	@if [ -x ./generate-certs.sh ] && { [ ! -d "./certs" ] || [ ! -f "./certs/cert.pem" ] || [ ! -f "./certs/key.pem" ]; }; then \
		printf '%b\n' "$(BOLD)$(CYAN)==>$(RESET) Generating SSL certificates"; \
		./generate-certs.sh "localhost,$(HOST_IP),$(HOST_FQDN)"; \
	fi
endef

banner:
	@printf '%b' "$(BOLD)$(MAGENTA)"
	@printf '%s\n' \
	'⠀⠀⠀⠀⠀⠀⠠⢠⠀⢠⠰⡄⠀⣴⣴⠀⣠⡆⢀⣶⠀⢀⣦⣶⣶⣶⠀⣶⣴⣶⡠⢰⣶⣆⠀⡔⡄⠀⣀⠀⠰⡐⢠⠄⣂⠄⢰⡀⠀⠂' \
	'⠀⠀⠀⠀⠀⠀⠐⠤⢠⠏⡰⢁⣾⣿⣯⣀⠹⣣⣿⣿⡄⡞⣿⣿⣿⣿⢾⣿⣿⣿⣿⣾⣷⣧⣲⣿⣷⣠⡏⡆⠈⡃⠈⡄⠠⡘⠢⠉⠁⠀' \
	'⠀⠀⠀⠀⠀⠒⠲⠠⠃⠠⡴⢾⣿⣿⣿⣿⡷⢻⣿⣿⣿⣿⣿⣿⢟⢅⣽⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡗⢰⡀⠀⠐⠀⠁⠐⠀⠄⠀' \
	'⠀⠀⠀⠀⡀⢐⠀⡀⡀⠀⠀⠈⠉⠙⠛⠻⢿⣽⣿⣿⣿⣿⣿⡏⣰⣿⡿⣿⣿⠿⠿⠿⠿⠿⠿⠿⠿⣿⣿⣿⣾⣷⠀⠀⢀⡤⠀⠀⠈⠀' \
	'⠀⠀⠀⠀⠑⠴⡨⠂⠐⠀⠀⠁⠀⠀⠀⠀⠀⠹⣿⣿⣿⣿⡿⣙⠫⢑⡀⣀⠤⠠⣒⣶⣶⣿⣿⣿⣿⣿⣿⣿⣿⣿⠆⠀⠜⡇⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⣉⢁⡀⠀⠂⠂⠶⠂⢄⢀⠀⠀⠀⠣⢿⣿⣿⣿⣧⡽⡁⠃⠀⠀⡚⣺⣯⣤⣤⣴⣾⣭⣭⣿⣿⣿⣿⣿⠃⠎⡜⡇⠀⠀⠀⠀' \
	'⠀⠀⢀⡔⢑⣾⡇⠀⠀⠀⡐⢀⡀⠀⠀⠀⠀⠀⠺⣿⣿⣿⣿⡷⡣⠀⠀⠀⢉⡁⠀⠀⠀⢠⣤⣤⣬⣭⣭⣿⣿⣿⠘⡀⢀⠛⠀⠀⠀⠀' \
	'⠀⠀⠈⢊⠜⢻⣿⣦⣤⣴⣿⣧⣱⡀⠕⢀⠀⠀⠀⢹⣿⣿⣿⣿⡷⣧⢂⣼⣿⣧⡀⠀⢀⣼⣿⣿⣿⡏⡑⡿⣻⠃⢨⣇⡽⠃⠀⠀⠀⠀' \
	'⠀⠀⠠⡂⡙⠆⢿⣿⣿⠿⠿⠿⠛⠀⠆⠈⠃⠀⠀⢼⣿⡟⠄⣽⣾⣿⡾⣿⣿⣿⣿⣿⣿⣿⣿⣿⢏⢞⡾⢡⣟⢰⠐⠜⠐⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠁⠳⢂⣬⣉⣭⣤⣴⡦⡀⠀⠀⠀⠀⠀⠀⢸⣿⡇⠐⠹⢙⡿⣗⠍⠛⡻⠿⠿⠿⠿⢛⣭⡮⠼⠃⣾⠏⠎⡀⡔⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠠⠛⢖⣶⣭⣿⣿⡿⣋⣘⠄⠀⠄⠀⠂⠀⠀⢸⢿⣿⣿⣿⣦⣝⣶⣭⣊⡵⢶⣾⣿⡿⠟⣋⣤⣾⣿⢯⠰⠔⠾⠁⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⣢⣿⣿⣿⣿⣿⣿⣿⣷⠸⠀⠀⡄⠀⠀⠀⢸⠙⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣾⣿⣿⣿⣿⣿⠄⠐⠀⠁⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠁⠠⣻⣿⣿⣿⣿⣿⣿⣿⣿⠁⠀⠄⠀⠀⠀⠀⢘⣰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⢨⣸⣿⣿⣿⣿⣿⣿⡿⠋⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⣽⣿⣿⣿⣿⣿⢟⠎⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡳⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠈⠽⣻⢿⡿⢋⡂⠀⠨⠀⠄⠀⠀⡀⠄⡴⣷⣆⣽⡼⢹⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠘⢰⠟⠤⠑⢐⠉⠁⠉⠀⠀⠠⠑⠀⢡⠁⠘⣿⡇⡏⣿⣿⣿⣿⣿⣿⣿⣿⡿⡫⠓⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⢈⠖⡄⠈⠀⡀⠐⠠⠀⠀⠀⠀⠀⠂⠀⠀⠀⠞⡗⢹⣿⣿⣿⣿⣿⣿⢟⡩⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢄⠀⠀⠀⣄⡀⣠⡭⡢⢛⡛⣻⣿⡿⣋⠆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠢⠀⠀⠀⠖⠊⢷⢹⡗⣇⡞⣿⣿⣿⡟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⡉⢴⢻⠐⣿⡸⢩⡉⠉⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢐⢣⣿⠠⣟⠟⡏⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⠀⠀⢀⢡⢹⠃⠀⠁⢠⣿⡸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠬⠖⠀⠀⠀⠀⢀⣝⣇⠱⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠰⠀⡄⢘⣀⠀⠀⠀⡀⡀⠈⠚⣿⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠃⠀⠀⠏⠀⠀⠌⠑⠅⠸⡇⡜⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⢨⡇⠠⣳⢃⠨⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⡾⠁⠀⠉⢈⡄⠹⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡌⡟⠁⠀⠀⢈⢪⣿⡄⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠖⠀⠀⠀⠀⠀⠀⠀⡀⣷⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠄⠀⠀⠀⠀⠀⠀⠀⠙⠟⣵⠈⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀' \
	'⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢎⠧⡐⠀⠀⠀'
	@printf '%b\n' "$(RESET)"
	@printf '%b\n\n' "$(BOLD)$(CYAN)ft_transcendence$(RESET) $(DIM)- stack Pong temps réel sécurisée$(RESET)"

help: banner
	@printf '%b\n' "$(BOLD)Cibles disponibles$(RESET)"
	@printf '%b\n' "  $(CYAN)make$(RESET) / $(CYAN)make up$(RESET)          Génère .env, build et lance les conteneurs"
	@printf '%b\n' "  $(CYAN)make up-attached$(RESET)         Lance les conteneurs avec les logs attachés"
	@printf '%b\n' "  $(CYAN)make env$(RESET)                 Génère ou rafraîchit le .env local-demo"
	@printf '%b\n' "  $(CYAN)make check-env$(RESET)           Vérifie le .env généré"
	@printf '%b\n' "  $(CYAN)make address$(RESET)             Affiche les URLs locale et réseau"
	@printf '%b\n' "  $(CYAN)make logs$(RESET)                Suit les logs Docker"
	@printf '%b\n' "  $(CYAN)make down$(RESET)                Arrête les conteneurs"
	@printf '%b\n' "  $(CYAN)make fclean$(RESET)              Supprime conteneurs, images et volumes"

env:
	$(call log_step,Génération du .env local-demo)
	@HOST_IP="$(HOST_IP)" HOST_FQDN="$(HOST_FQDN)" ./scripts/generate-env.sh

check-env: env
	$(call log_step,Vérification du .env)
	@./check_env.sh

up: banner env
	$(call update_certs)
	$(call log_step,Build et démarrage des services Docker)
	@HOST_IP="$(HOST_IP)" docker compose up --build -d
	$(call print_addresses)

up-attached: banner env
	$(call update_certs)
	$(call log_step,Build et démarrage des services Docker avec logs attachés)
	@HOST_IP="$(HOST_IP)" docker compose up --build

down:
	$(call log_step,Arrêt des services Docker)
	@docker compose down

restart: banner env
	$(call log_step,Redémarrage des services Docker)
	@docker compose down
	$(call update_certs)
	@HOST_IP="$(HOST_IP)" docker compose up --build -d
	$(call print_addresses)

address:
	$(call print_addresses)

fclean:
	$(call log_warn,Suppression des conteneurs, images et volumes)
	@docker compose down --rmi all --volumes

aggressivecleanup:
	$(call log_warn,Nettoyage Docker agressif)
	@docker compose down --volumes --remove-orphans || true
	@docker images -aq | xargs -r docker rmi -f
	@docker system prune -af --volumes

re: fclean up

container:
	@docker compose ps

logs:
	@docker compose logs -f

userservice-logs:
	@docker compose logs -f user-service

gateway-logs:
	@docker compose logs -f gateway

gameserver-logs:
	@docker compose logs -f game-server

matchmaking-logs:
	@docker compose logs -f matchmaking-service

auth-logs:
	@docker compose logs -f auth-service

chat-logs:
	@docker compose logs -f chat-service

ps:
	@docker compose ps

exec:
	@docker compose exec gateway sh
