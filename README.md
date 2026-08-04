# NEXUS CRM

Локальная CRM для двух пользователей: клиенты → проекты → задачи → чек-листы и обсуждения. Backend работает на Express и SQLite, интерфейс — Vue 3 + Vite. Внешние сервисы не нужны.

## Локальный запуск

Требуется Node.js 20+ (рекомендуется 22).

```bash
copy .env.example .env
npm install
npm run install:all
npm run dev
```

Перед запуском замените значения `LESHA_KEY` и `DENIS_KEY` в `.env`. Откройте `http://localhost:5173`. API доступен на `http://localhost:3000`; база автоматически появится в `data/crm.db`.

Также сервер и клиент можно запускать раздельно:

```bash
npm run dev --prefix server
npm run dev --prefix client
```

## Docker

Создайте `.env` из примера и задайте секретные ключи, затем:

```bash
docker compose up --build
```

Приложение: `http://localhost:8080`. API также проброшен на `http://localhost:3000`. SQLite хранится в локальной папке `./data`, поэтому пересборка контейнеров не удаляет данные.

Остановка:

```bash
docker compose down
```

### Автоматический деплой

На Linux-сервере сделайте скрипт исполняемым и запустите его из корня проекта:

```bash
chmod +x deploy.sh
./deploy.sh
```

Скрипт выполняет `git pull --ff-only`, пересобирает и перезапускает Compose-сервисы, затем проверяет состояние контейнеров. Журналы сохраняются в `logs/`. Таймаут ожидания можно изменить, например: `DEPLOY_WAIT_TIMEOUT=180 ./deploy.sh`.

## API

Логин: `POST /api/auth/login` с JSON `{ "key": "..." }`. Остальные маршруты требуют заголовок `Authorization: Bearer <key>`.

- `/api/clients` — CRUD клиентов
- `/api/projects` — CRUD проектов, фильтр `?clientId=`
- `/api/tasks` — CRUD задач, фильтр `?projectId=`
- `/api/tasks/:id/todos` — чек-лист задачи
- `/api/tasks/:id/messages` — сообщения задачи

Удаление клиента каскадно удаляет проекты и их содержимое; удаление проекта — его задачи. Сообщение в чате всегда подписывается сервером именем текущего пользователя.
