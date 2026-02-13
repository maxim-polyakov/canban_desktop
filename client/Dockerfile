FROM node:20-alpine

WORKDIR /app

# Копируем package.json, package-lock.json и ставим зависимости
COPY package.json package-lock.json* ./
RUN npm ci

# Копируем весь код и собираем production-версию
COPY . .
RUN npm run build

# Устанавливаем serve для отдачи статики
RUN npm install -g serve

EXPOSE 3000

# Запуск production-бандла
CMD ["serve", "-s", "build", "-l", "3000"]
