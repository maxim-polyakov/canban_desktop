# Сборка
ARG REACT_APP_API_URL=http://localhost:5000
FROM node:18-alpine AS build
WORKDIR /app

ENV REACT_APP_API_URL=$REACT_APP_API_URL

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Раздача статики
FROM nginx:alpine AS runtime
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
