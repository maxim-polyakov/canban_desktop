# Канбан — фронтенд (React)

Сборка на **Create React App** (без Vite). Все компоненты в формате `.jsx`. Клиент и сервер запускаются отдельно (в т.ч. в Docker); URL бэкенда задаётся через `.env`.

## Настройка

1. Скопировать `.env.example` в `.env`.
2. В `.env` указать адрес бэкенда:
   ```
   REACT_APP_API_URL=https://baxic.ru
   ```
   Без слэша в конце. На хосте baxic.ru настройте проводку по IP на ваш сервис API.

## Запуск

1. `npm install`
2. `npm start` — dev-сервер (например, http://localhost:3000)

Для Docker: соберите образ и передавайте `REACT_APP_API_URL` при сборке (build-time) или используйте `.env` в контейнере при `npm run build`.

## Структура

- `src/index.js` — точка входа
- `src/App.jsx` — маршруты, защищённые страницы
- `src/context/AuthContext.jsx` — авторизация (JWT в localStorage)
- `src/api.js` — запросы к API (база берётся из `REACT_APP_API_URL`)
- `src/pages/` — страницы: логин, регистрация, главная, доска
- `src/components/` — Layout, канбан-колонки, карточки квестов, drag-n-drop (@dnd-kit)

## Сборка

`npm run build` — результат в `build/`. Переменная `REACT_APP_API_URL` подставляется на этапе сборки.
