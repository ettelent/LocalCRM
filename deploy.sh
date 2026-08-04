#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/logs"
LOG_FILE="${LOG_DIR}/deploy-$(date '+%Y%m%d-%H%M%S').log"
WAIT_TIMEOUT="${DEPLOY_WAIT_TIMEOUT:-120}"

mkdir -p "${LOG_DIR}"
cd "${SCRIPT_DIR}"
exec > >(tee -a "${LOG_FILE}") 2>&1

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  log "ОШИБКА: Docker Compose не найден."
  exit 1
fi

diagnostics() {
  local exit_code=$?
  log "ОШИБКА: деплой прерван (код ${exit_code}, строка ${BASH_LINENO[0]})."
  log "Текущее состояние контейнеров:"
  "${COMPOSE[@]}" ps --all || true
  log "Последние 100 строк логов:"
  "${COMPOSE[@]}" logs --no-color --tail=100 || true
  log "Полный журнал деплоя: ${LOG_FILE}"
  exit "${exit_code}"
}
trap diagnostics ERR

for command_name in git docker; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    log "ОШИБКА: команда '${command_name}' не найдена."
    exit 1
  fi
done

if [[ ! -f docker-compose.yml && ! -f compose.yml && ! -f compose.yaml ]]; then
  log "ОШИБКА: Compose-файл не найден в ${SCRIPT_DIR}."
  exit 1
fi

if [[ ! -f .env ]]; then
  log "ОШИБКА: отсутствует .env. Создайте его на основе .env.example."
  exit 1
fi

log "Начинаем деплой в ${SCRIPT_DIR}."
log "Получаем изменения из Git (только fast-forward)."
git pull --ff-only

log "Собираем образы и запускаем сервисы."
"${COMPOSE[@]}" up -d --build --remove-orphans

log "Ожидаем готовность контейнеров (таймаут: ${WAIT_TIMEOUT} сек.)."
deadline=$((SECONDS + WAIT_TIMEOUT))
while (( SECONDS < deadline )); do
  mapfile -t container_ids < <("${COMPOSE[@]}" ps -q)

  if (( ${#container_ids[@]} > 0 )); then
    all_ready=true
    for container_id in "${container_ids[@]}"; do
      state="$(docker inspect --format '{{.State.Status}}' "${container_id}")"
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${container_id}")"

      if [[ "${state}" == "exited" || "${state}" == "dead" || "${health}" == "unhealthy" ]]; then
        log "Контейнер ${container_id} неисправен: state=${state}, health=${health}."
        false
      fi

      if [[ "${state}" != "running" || "${health}" == "starting" ]]; then
        all_ready=false
      fi
    done

    if [[ "${all_ready}" == true ]]; then
      log "Все контейнеры запущены."
      "${COMPOSE[@]}" ps
      log "Деплой успешно завершён. Журнал: ${LOG_FILE}"
      exit 0
    fi
  fi

  sleep 3
done

log "ОШИБКА: контейнеры не перешли в рабочее состояние за ${WAIT_TIMEOUT} сек."
false
