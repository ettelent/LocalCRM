# NEXUS CRM

Локальная CRM для двух пользователей: клиенты → проекты → задачи → чек-листы и обсуждения. Также доступны общий реестр задач, глобальный поиск и график оплат.

Backend работает на Express. Для локального запуска используется SQLite, для Docker — MySQL. Интерфейс построен на Vue 3 + Vite.

## Запуск без Docker

Требуется Node.js 22 или новее.

```bash
copy .env.example .env
npm install
npm run install:all
npm run build
npm start
```

Перед запуском замените `LESHA_KEY` и `DENIS_KEY` в `.env`. Готовое приложение вместе с API будет доступно на `http://localhost:3000`. SQLite-база создаётся в `data/crm.db`.

Для разработки клиент и API можно запустить отдельно:

```bash
npm run dev
```

В этом режиме клиент доступен на `http://localhost:5173`, API — на `http://localhost:3000`.

## Docker

Создайте `.env` и выполните:

```bash
docker compose up --build
```

- CRM: `http://localhost:5173`
- API: `http://localhost:3000`
- phpMyAdmin: `http://localhost:8081`
- MySQL: `localhost:3306`

Остановка:

```bash
docker compose down
```

На Linux-сервере автоматическое обновление и перезапуск выполняет `deploy.sh`.

## Основные маршруты API

Все маршруты, кроме входа, требуют `Authorization: Bearer <key>`.

- `POST /api/auth/login` — вход по персональному ключу.
- `/api/clients` — CRUD клиентов и стадии канбана.
- `/api/projects` — CRUD проектов, фильтр `?clientId=`.
- `/api/tasks` — CRUD задач и расширенные поля исполнителя, приоритета и срока.
- `/api/tasks/:id/todos` — чек-лист задачи.
- `/api/tasks/:id/messages` — обсуждение задачи.
- `/api/payment-schedules` — график и статусы оплат.
- `GET /api/search?q=` — поиск по клиентам, проектам, задачам и сообщениям.

Удаление клиента каскадно удаляет его проекты и связанные данные; удаление проекта — его задачи.
