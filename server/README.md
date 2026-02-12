# Canban Server — backend канбан-доски с геймификацией

Backend на **ASP.NET Core 8** (C#) для канбан-доски с персонажами, уровнями, ачивками и деревом навыков.

## Структура решения

```
server/
├── CanbanServer.sln
└── src/
    ├── CanbanServer.Api/           # Web API, контроллеры, Program.cs
    ├── CanbanServer.Application/   # DTO, контракты сервисов (интерфейсы)
    ├── CanbanServer.Domain/        # Сущности: User, Character, Board, Column, Quest, Level, Achievement, Skill, Activity
    └── CanbanServer.Infrastructure/ # EF Core, реализация сервисов, SignalR Hub
```

## Фичи

- **Канбан**: доски, колонки, квесты (задачи). Drag-n-drop на фронте (React DnD / Vue Draggable) — API: `POST /api/quests/move` с `MoveQuestRequest`.
- **Уровни**: опыт начисляется за закрытие квеста, за дедлайн, за оценку коллег. Уровни задаются таблицей `Level` (кумулятивный XP).
- **Дерево навыков**: навыки открываются по ачивкам или по условиям (например, «10 квестов Frontend»). API: `GET /api/skills/tree`.
- **Лента активности**: события «Анна получила уровень 5!», «Сергей закрыл эпик» — сохраняются в БД и дублируются в реалтайм через **SignalR** (`/hubs/activity`). Клиент: `JoinTeam(teamId)`, событие `Activity`.
- **Тим-лидерборд**: рейтинг **внутри команды** за период (по умолчанию — последняя неделя). `GET /api/leaderboard/team/{teamId}?from=...&to=...`.

## Запуск

1. Установите [.NET 8 SDK](https://dotnet.microsoft.com/download).
2. Укажите строку подключения в `src/CanbanServer.Api/appsettings.json` (по умолчанию LocalDB).
3. Из папки `server`:
   ```bash
   dotnet run --project src/CanbanServer.Api
   ```
4. API: `https://localhost:5xxx` (порт в консоли). Swagger: `https://localhost:5xxx/swagger`.

## Основные эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/boards/team/{teamId}` | Список досок команды |
| GET | `/api/boards/{id}` | Доска с колонками и квестами |
| GET | `/api/columns/board/{boardId}` | Колонки доски |
| GET | `/api/quests/column/{columnId}` | Квесты колонки |
| **POST** | **`/api/quests/move`** | **Перемещение квеста (drag-n-drop), начисление XP при переносе в «Готово»** |
| GET | `/api/characters/me` | Персонаж текущего пользователя |
| GET | `/api/activity/team/{teamId}` | Лента активности команды |
| GET | `/api/leaderboard/team/{teamId}` | Лидерборд команды за неделю |
| GET | `/api/skills/tree` | Дерево навыков с флагами открыто/закрыто |
| GET | `/api/achievements/me` | Ачивки пользователя |

## Реалтайм (SignalR)

- Подключение: `HubConnection` к `https://localhost:5xxx/hubs/activity`.
- Вызов `JoinTeam(teamId)` — подписка на события команды.
- Слушать событие `Activity` — объект `ActivityDto` (тип, заголовок, пользователь, дата).

## БД и миграции

При первом запуске вызывается `EnsureCreatedAsync()` и сидируются уровни (1–50). Для продакшена лучше перейти на миграции:

```bash
cd src/CanbanServer.Api
dotnet ef migrations add Initial --project ../CanbanServer.Infrastructure --startup-project .
dotnet ef database update --project ../CanbanServer.Infrastructure --startup-project .
```

В `Program.cs` заменить `EnsureCreatedAsync()` на `MigrateAsync()`.

## Дальнейшие шаги

- Аутентификация: JWT или cookie, подставить `GetCurrentUserId()` в контроллерах из `ClaimsPrincipal`.
- Проверка прав: пользователь может двигать квесты только на досках своей команды.
- Ревью квестов: эндпоинт создания `QuestReview` и вызов `ICharacterXpService.AwardPeerReviewAsync`.
- Проверка условий ачивок и разблокировка навыков (фоновый сервис или при начислении XP).
