# Canban Desktop

Канбан-доска с геймификацией: уровни, XP, достижения, дерево навыков, командные доски и реалтайм-обновления. Стек: **React** (клиент) + **ASP.NET Core 7** (API) + **PostgreSQL** + **Redis** + **SignalR**.

## Возможности

- Канбан: доски, колонки, квесты, drag-and-drop
- Команды, приглашения по email, несколько досок на команду
- Геймификация: XP за закрытие квестов, уровни, достижения, дерево навыков
- Лента активности команды (SignalR)
- Тим-лидерборд и KPI за период
- Регистрация с подтверждением email, сброс пароля
- Вход через **Google** (без отдельной регистрации; аватар из Google-аккаунта)
- Кэширование API через **Redis**
- Реалтайм-синхронизация доски между пользователями (SignalR `/hubs/board`)

## Структура репозитория

```
canban_desktop/
├── client/                 # React (Create React App)
├── server/                 # ASP.NET Core API
│   ├── src/
│   │   ├── CanbanServer.Api/
│   │   ├── CanbanServer.Application/
│   │   ├── CanbanServer.Domain/
│   │   └── CanbanServer.Infrastructure/
│   ├── docs/GOOGLE_OAUTH_SETUP.md
│   └── README.md
├── docker-compose.yml
└── README.md
```

## Быстрый старт (Docker)

1. Скопируйте конфигурацию:
   - `server/.env` — по образцу `server/src/CanbanServer.Api/.env.example`
   - `client/.env` — по образцу `client/.env.example`

2. Запуск:

```bash
docker compose up -d --build
```

| Сервис   | Порт (хост) | Описание        |
|----------|-------------|-----------------|
| client   | 3177        | Веб-интерфейс   |
| api      | 5177        | REST API + SignalR |
| redis    | 6379        | Кэш             |
| maildev  | 8183        | Просмотр почты (SMTP в dev) |

Клиент: http://localhost:3177  
API (Swagger в Development): http://localhost:5177/swagger

## Локальная разработка

### Требования

- [.NET 7 SDK](https://dotnet.microsoft.com/download)
- [Node.js](https://nodejs.org/) 18+
- PostgreSQL
- Redis (опционально; без Redis используется in-memory кэш)

### API

```bash
cd server
# Настройте server/.env (строка подключения к PostgreSQL, JWT, CORS, Google OAuth)
dotnet run --project src/CanbanServer.Api
```

### Клиент

```bash
cd client
cp .env.example .env
# REACT_APP_API_URL=http://localhost:5177
npm install
npm start
```

## Переменные окружения

### Сервер (`server/.env`)

| Переменная | Описание |
|------------|----------|
| `ConnectionStrings__DefaultConnection` | PostgreSQL |
| `Jwt__Key`, `Jwt__Issuer`, `Jwt__Audience`, `Jwt__ExpirationMinutes` | JWT |
| `Cors__AllowedOrigins` | Origin клиента (через `;`), нужен для входа с Bearer |
| `Redis__Configuration` | Redis (`localhost:6379` или `redis:6379` в Docker) |
| `Google__ClientId`, `Google__ClientSecret` | OAuth Google |
| `Auth__FrontendCallbackUrl` | URL фронта для редиректа после Google (например `https://canban.baxic.ru`) |
| `Smtp__*` | Почта (подтверждение регистрации, сброс пароля) |
| `S3__*` | Yandex Object Storage / S3 для аватаров |

### Клиент (`client/.env`)

| Переменная | Описание |
|------------|----------|
| `REACT_APP_API_URL` | Базовый URL API **без** завершающего `/` |

## Авторизация

### Email и пароль

- `POST /api/auth/register` — регистрация (код на почту)
- `POST /api/auth/confirm-email` — подтверждение и вход
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`

Пользователи только через Google имеют `PasswordHash = null` и не могут войти по паролю.

### Google OAuth

1. Настройка: [server/docs/GOOGLE_OAUTH_SETUP.md](server/docs/GOOGLE_OAUTH_SETUP.md)
2. В [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) в **Authorized redirect URIs** укажите:
   ```
   https://<ваш-домен-api>/signin-google
   ```
   Пример: `https://canbanapi.baxic.ru/signin-google`
3. Кнопка на клиенте ведёт на `GET /api/auth/google`; после входа редирект на `{Auth__FrontendCallbackUrl}/auth/callback#token=...`

За nginx API должен передавать `X-Forwarded-Proto` и `X-Forwarded-Host` (см. `server/nginx-api.conf.example`).

## SignalR

| Хаб | Путь | Назначение |
|-----|------|------------|
| Activity | `/hubs/activity` | Лента активности команды (`JoinTeam`) |
| Board | `/hubs/board` | Обновление доски в реалтайме (`JoinBoard`, событие `BoardUpdated`) |

Клиент подключается с JWT (`access_token` в query или заголовке `Authorization`).

## База данных

При первом запуске API вызывается `EnsureCreatedAsync()` и сиды (уровни, достижения, навыки).

Если БД уже создана до входа через Google, сделайте пароль nullable:

```sql
ALTER TABLE "Users" ALTER COLUMN "PasswordHash" DROP NOT NULL;
```

Для продакшена рекомендуется перейти на EF Core Migrations (см. [server/README.md](server/README.md)).

## Дополнительно

- [server/README.md](server/README.md) — API, эндпоинты, архитектура
- [client/README.md](client/README.md) — фронтенд
- [server/docs/GOOGLE_OAUTH_SETUP.md](server/docs/GOOGLE_OAUTH_SETUP.md) — Google OAuth
- [server/nginx-api.conf.example](server/nginx-api.conf.example) — пример nginx для API (CORS, WebSocket, `/hubs/`)

## Лицензия

Уточните лицензию в репозитории при необходимости.
