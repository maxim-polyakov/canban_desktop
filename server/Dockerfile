# Сборка
FROM mcr.microsoft.com/dotnet/sdk:7.0 AS build
WORKDIR /src

COPY CanbanServer.sln ./
COPY src/CanbanServer.Api/CanbanServer.Api.csproj src/CanbanServer.Api/
COPY src/CanbanServer.Application/CanbanServer.Application.csproj src/CanbanServer.Application/
COPY src/CanbanServer.Domain/CanbanServer.Domain.csproj src/CanbanServer.Domain/
COPY src/CanbanServer.Infrastructure/CanbanServer.Infrastructure.csproj src/CanbanServer.Infrastructure/

RUN dotnet restore CanbanServer.sln

COPY . .
RUN dotnet publish src/CanbanServer.Api/CanbanServer.Api.csproj -c Release -o /app/publish --no-restore

# Запуск
FROM mcr.microsoft.com/dotnet/aspnet:7.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_URLS=http://0.0.0.0:5000

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "CanbanServer.Api.dll"]
