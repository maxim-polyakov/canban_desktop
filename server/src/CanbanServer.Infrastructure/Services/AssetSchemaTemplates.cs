using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Starter object types and attributes, mirroring the Jira Assets schema templates.</summary>
public static class AssetSchemaTemplates
{
    public static readonly string[] Names = { "empty", "it", "services", "facilities" };

    private const string HardwareStatus = "В использовании\nНа складе\nВ ремонте\nСписан";

    public static void Apply(CanbanDbContext db, AssetSchema schema, string? template)
    {
        var builder = new Builder(db, schema.Id);
        switch (template)
        {
            case "it":
                var locations = builder.Type("Местоположения", "location", null, "Офисы и склады");
                var office = builder.Type("Офис", "location", locations);
                builder.Attr(office, "Город", AssetAttributeType.Text);
                builder.Attr(office, "Адрес", AssetAttributeType.Text);
                var hardware = builder.Type("Оборудование", "folder", null, "Всё физическое оборудование компании");
                builder.Attr(hardware, "Статус", AssetAttributeType.Status, options: HardwareStatus, required: true);
                builder.Attr(hardware, "Владелец", AssetAttributeType.User);
                builder.Attr(hardware, "Серийный номер", AssetAttributeType.Text);
                builder.Attr(hardware, "Местоположение", AssetAttributeType.Reference, reference: office);
                builder.Attr(hardware, "Дата покупки", AssetAttributeType.Date);
                builder.Attr(hardware, "Гарантия до", AssetAttributeType.Date);
                builder.Attr(hardware, "Стоимость", AssetAttributeType.Number);
                var laptop = builder.Type("Ноутбук", "laptop", hardware);
                builder.Attr(laptop, "Модель", AssetAttributeType.Text);
                builder.Attr(laptop, "ОЗУ, ГБ", AssetAttributeType.Number);
                var server = builder.Type("Сервер", "server", hardware);
                builder.Attr(server, "IP-адрес", AssetAttributeType.Text);
                builder.Attr(server, "ОС", AssetAttributeType.Select, options: "Linux\nWindows Server\nmacOS\nДругая");
                builder.Type("Монитор", "monitor", hardware);
                builder.Type("Телефон", "phone", hardware);
                var software = builder.Type("Программное обеспечение", "software", null, "Лицензии и подписки");
                var license = builder.Type("Лицензия", "license", software);
                builder.Attr(license, "Поставщик", AssetAttributeType.Text);
                builder.Attr(license, "Количество мест", AssetAttributeType.Number);
                builder.Attr(license, "Истекает", AssetAttributeType.Date);
                builder.Attr(license, "Ответственный", AssetAttributeType.User);
                builder.Attr(license, "Сайт", AssetAttributeType.Url);
                break;
            case "services":
                var service = builder.Type("Бизнес-сервис", "service", null, "Сервисы, которые получают пользователи");
                builder.Attr(service, "Владелец", AssetAttributeType.User, required: true);
                builder.Attr(service, "Критичность", AssetAttributeType.Select, options: "Высокая\nСредняя\nНизкая", required: true);
                builder.Attr(service, "Статус", AssetAttributeType.Status, options: "Работает\nДеградация\nНедоступен\nВыведен");
                var app = builder.Type("Приложение", "software", null);
                builder.Attr(app, "Сервис", AssetAttributeType.Reference, reference: service);
                builder.Attr(app, "Репозиторий", AssetAttributeType.Url);
                builder.Attr(app, "Ответственная команда", AssetAttributeType.Text);
                var env = builder.Type("Окружение", "network", null);
                builder.Attr(env, "Тип", AssetAttributeType.Select, options: "Production\nStaging\nDevelopment");
                builder.Attr(env, "Приложение", AssetAttributeType.Reference, reference: app);
                builder.Attr(env, "URL", AssetAttributeType.Url);
                break;
            case "facilities":
                var building = builder.Type("Здание", "location", null);
                builder.Attr(building, "Адрес", AssetAttributeType.Text, required: true);
                var room = builder.Type("Помещение", "folder", null);
                builder.Attr(room, "Здание", AssetAttributeType.Reference, reference: building);
                builder.Attr(room, "Вместимость", AssetAttributeType.Number);
                var equipment = builder.Type("Инвентарь", "box", null);
                builder.Attr(equipment, "Помещение", AssetAttributeType.Reference, reference: room);
                builder.Attr(equipment, "Инвентарный номер", AssetAttributeType.Text);
                builder.Attr(equipment, "Состояние", AssetAttributeType.Status, options: "Исправно\nТребует ремонта\nСписано");
                break;
        }
    }

    private sealed class Builder
    {
        private readonly CanbanDbContext _db;
        private readonly Guid _schemaId;
        private int _typePosition;
        private readonly Dictionary<Guid, int> _attrPositions = new();

        public Builder(CanbanDbContext db, Guid schemaId) { _db = db; _schemaId = schemaId; }

        public Guid Type(string name, string icon, Guid? parent, string? description = null)
        {
            var type = new AssetObjectType { Id = Guid.NewGuid(), SchemaId = _schemaId, ParentTypeId = parent, Name = name, Icon = icon, Description = description, Position = _typePosition++ };
            _db.AssetObjectTypes.Add(type);
            return type.Id;
        }

        public void Attr(Guid typeId, string name, AssetAttributeType type, string? options = null, Guid? reference = null, bool required = false)
        {
            var position = _attrPositions.GetValueOrDefault(typeId);
            _attrPositions[typeId] = position + 1;
            _db.AssetAttributes.Add(new AssetAttribute
            {
                Id = Guid.NewGuid(), ObjectTypeId = typeId, Name = name, Type = type, Options = options,
                ReferenceTypeId = reference, Required = required, Position = position,
            });
        }
    }
}
