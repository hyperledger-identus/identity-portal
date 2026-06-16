set dotenv-load := true

compose := "docker compose --env-file .env.docker"

default:
  just --list

up:
  {{compose}} up -d

down:
  {{compose}} down --remove-orphans

clean:
  {{compose}} down --remove-orphans --volumes

logs service="":
  {{compose}} logs -f {{service}}

ps:
  {{compose}} ps

health:
  @printf "NeoPRISM: "
  @curl -fsS http://localhost:${NEOPRISM_PORT:-8081}/api/_system/health && printf "\n"
  @printf "Cloud Agent: "
  @curl -fsS http://localhost:${CLOUD_AGENT_HTTP_PORT:-8085}/_system/health && printf "\n"
  @printf "Mediator: "
  @curl -fsS http://localhost:${MEDIATOR_PORT:-8080}/health && printf "\n"

restart service:
  {{compose}} restart {{service}}
