using System.Text.Json;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class IssueFieldTests
{
    private static CustomFieldDefinition Field(string type, params string[] options) => new()
    {
        Id = Guid.NewGuid(),
        TeamId = Guid.NewGuid(),
        Name = "Поле",
        FieldType = type,
        OptionsJson = JsonSerializer.Serialize(options),
    };

    private static JsonElement Raw(object value) => JsonSerializer.SerializeToElement(value);

    [Fact]
    public void ValuesAreNormalizedByFieldType()
    {
        Assert.Equal("abc", IssueFieldService.Normalize(Field("text"), Raw("  abc "))!.Value.GetString());
        Assert.Null(IssueFieldService.Normalize(Field("text"), Raw("   ")));
        Assert.Null(IssueFieldService.Normalize(Field("text"), null));
        Assert.Throws<ArgumentException>(() => IssueFieldService.Normalize(Field("text"), Raw(new string('x', 256))));

        Assert.Equal(12.5m, IssueFieldService.Normalize(Field("number"), Raw("12,5"))!.Value.GetDecimal());
        Assert.Equal(7m, IssueFieldService.Normalize(Field("number"), Raw(7))!.Value.GetDecimal());
        Assert.Throws<ArgumentException>(() => IssueFieldService.Normalize(Field("number"), Raw("много")));

        Assert.Equal("2026-10-20", IssueFieldService.Normalize(Field("date"), Raw("2026-10-20T15:00:00Z"))!.Value.GetString());
        Assert.Throws<ArgumentException>(() => IssueFieldService.Normalize(Field("date"), Raw("вчера")));

        Assert.True(IssueFieldService.Normalize(Field("checkbox"), Raw(true))!.Value.GetBoolean());
        Assert.Null(IssueFieldService.Normalize(Field("checkbox"), Raw(false)));

        Assert.Equal("https://example.com/", IssueFieldService.Normalize(Field("url"), Raw("example.com"))!.Value.GetString());
        Assert.Throws<ArgumentException>(() => IssueFieldService.Normalize(Field("url"), Raw("javascript:alert(1)")));

        var user = Guid.NewGuid();
        Assert.Equal(user.ToString(), IssueFieldService.Normalize(Field("user"), Raw(user.ToString()))!.Value.GetString());
        Assert.Throws<ArgumentException>(() => IssueFieldService.Normalize(Field("user"), Raw("someone")));
    }

    [Fact]
    public void SelectValuesMustBeKnownOptions()
    {
        var select = Field("select", "Низкий", "Высокий");
        Assert.Equal("Высокий", IssueFieldService.Normalize(select, Raw("высокий"))!.Value.GetString());
        Assert.Throws<ArgumentException>(() => IssueFieldService.Normalize(select, Raw("Средний")));

        var multi = Field("multiselect", "iOS", "Android", "Web");
        var value = IssueFieldService.Normalize(multi, Raw(new[] { "web", "iOS", "Web" }))!.Value;
        Assert.Equal(new[] { "Web", "iOS" }, value.EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Equal("Web,iOS", IssueFieldService.Display(value));
        Assert.Null(IssueFieldService.Normalize(multi, Raw(Array.Empty<string>())));

        var labels = IssueFieldService.Normalize(Field("labels"), Raw("front back, Front"))!.Value;
        Assert.Equal(new[] { "front", "back" }, labels.EnumerateArray().Select(x => x.GetString()).ToArray());
    }

    [Fact]
    public void FieldsApplyToChosenSpacesAndTypes()
    {
        var board = Guid.NewGuid();
        var other = Guid.NewGuid();
        var customType = Guid.NewGuid();
        var everywhere = Field("text");
        Assert.True(IssueFieldService.Applies(everywhere, board, IssueType.Task, null));

        var scoped = Field("text");
        scoped.Boards = board.ToString();
        scoped.IssueTypes = $"{(int)IssueType.Bug},{customType}";
        Assert.True(IssueFieldService.Applies(scoped, board, IssueType.Bug, null));
        Assert.True(IssueFieldService.Applies(scoped, board, IssueType.Task, customType));
        Assert.False(IssueFieldService.Applies(scoped, board, IssueType.Task, null));
        Assert.False(IssueFieldService.Applies(scoped, board, IssueType.Bug, Guid.NewGuid()));
        Assert.False(IssueFieldService.Applies(scoped, other, IssueType.Bug, null));
    }

    [Fact]
    public void SpaceContextOverridesOptionsTypesAndDefault()
    {
        var board = Guid.NewGuid();
        var other = Guid.NewGuid();
        var field = Field("select", "Низкий", "Высокий");
        field.ContextsJson = JsonSerializer.Serialize(new[]
        {
            new FieldContext { Id = "mobile", Name = "Мобильные", Boards = { board }, IssueTypes = { ((int)IssueType.Bug).ToString() }, Options = { "P1", "P2" }, DefaultValue = Raw("P2") },
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        var context = IssueFieldService.ResolveContext(field, board)!;
        Assert.Equal("mobile", context.Id);
        Assert.Equal("P2", context.DefaultValue!.Value.GetString());
        Assert.Equal("P1", IssueFieldService.Normalize(field, Raw("p1"), context)!.Value.GetString());
        Assert.Throws<ArgumentException>(() => IssueFieldService.Normalize(field, Raw("Высокий"), context));
        Assert.True(IssueFieldService.Applies(field, board, IssueType.Bug, null));
        Assert.False(IssueFieldService.Applies(field, board, IssueType.Task, null));

        var global = IssueFieldService.ResolveContext(field, other)!;
        Assert.True(global.IsDefault);
        Assert.Equal("Высокий", IssueFieldService.Normalize(field, Raw("высокий"), global)!.Value.GetString());
        Assert.True(IssueFieldService.Applies(field, other, IssueType.Task, null));

        field.Boards = Guid.NewGuid().ToString();
        Assert.Null(IssueFieldService.ResolveContext(field, other));
        Assert.NotNull(IssueFieldService.ResolveContext(field, board));
    }

    [Fact]
    public void CascadingValuesNeedParentAndKnownChild()
    {
        var field = Field("cascading", "Европа", "Азия");
        field.CascadeJson = JsonSerializer.Serialize(new Dictionary<string, List<string>> { ["Европа"] = new() { "Берлин", "Париж" } });

        var full = IssueFieldService.Normalize(field, Raw(new[] { "европа", "париж" }))!.Value;
        Assert.Equal(new[] { "Европа", "Париж" }, full.EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Equal("Европа,Париж", IssueFieldService.Display(full));
        var parentOnly = IssueFieldService.Normalize(field, Raw(new { parent = "Азия", child = (string?)null }))!.Value;
        Assert.Equal(new[] { "Азия" }, parentOnly.EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Throws<ArgumentException>(() => IssueFieldService.Normalize(field, Raw(new[] { "Азия", "Берлин" })));
        Assert.Throws<ArgumentException>(() => IssueFieldService.Normalize(field, Raw(new[] { "Африка" })));
        Assert.Null(IssueFieldService.Normalize(field, Raw(Array.Empty<string>())));
    }

    [Fact]
    public void VersionAndGroupPickersStoreIds()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        Assert.Equal(a.ToString(), IssueFieldService.Normalize(Field("version"), Raw(a.ToString()))!.Value.GetString());
        var many = IssueFieldService.Normalize(Field("groups"), Raw(new[] { a.ToString(), b.ToString(), a.ToString() }))!.Value;
        Assert.Equal(2, many.GetArrayLength());
        Assert.Throws<ArgumentException>(() => IssueFieldService.Normalize(Field("group"), Raw("admins")));
        Assert.Null(IssueFieldService.Normalize(Field("versions"), Raw(Array.Empty<string>())));

        var version = new CustomFieldDefinition { Id = Guid.NewGuid(), TeamId = Guid.NewGuid(), Name = "Найдено в", FieldType = "version" };
        var quest = new Quest
        {
            Id = Guid.NewGuid(),
            Board = new Board { TeamId = version.TeamId },
            CustomFieldsJson = JsonSerializer.Serialize(new Dictionary<string, string> { [version.Id.ToString()] = a.ToString() }),
        };
        var custom = new JqlCustomFields(new[] { version }, new Dictionary<Guid, string>(), new Dictionary<Guid, string> { [a] = "1.0" });
        Assert.True(custom.TryGetValue(quest, "Найдено в", out var value));
        Assert.Equal($"1.0,{a}", value);
    }

    [Fact]
    public void JqlSearchesCustomFieldsAndTypes()
    {
        var teamId = Guid.NewGuid();
        var points = new CustomFieldDefinition { Id = Guid.NewGuid(), TeamId = teamId, Name = "Сумма договора", FieldType = "number" };
        var platform = new CustomFieldDefinition { Id = Guid.NewGuid(), TeamId = teamId, Name = "Платформа", FieldType = "multiselect" };
        var incident = Guid.NewGuid();
        var quest = new Quest
        {
            IssueKey = "KAN-1",
            IssueType = IssueType.Bug,
            IssueTypeId = incident,
            CreatedAt = DateTime.UtcNow,
            Board = new Board { TeamId = teamId },
            CustomFieldsJson = JsonSerializer.Serialize(new Dictionary<string, object>
            {
                [points.Id.ToString()] = 1500m,
                [platform.Id.ToString()] = new[] { "iOS", "Web" },
            }),
        };
        var custom = new JqlCustomFields(new[] { points, platform }, new Dictionary<Guid, string> { [incident] = "Инцидент" });
        bool Matches(string jql) => JqlService.Matches(new JqlParser(jql).Parse(), quest,
            new JqlService.JqlContext(Guid.NewGuid(), DateTime.UtcNow, q => q.CreatedAt, custom));

        Assert.True(Matches("\"Сумма договора\" > 1000"));
        Assert.False(Matches("\"Сумма договора\" > 2000"));
        Assert.True(Matches($"cf[{points.Id}] = 1500"));
        Assert.True(Matches("Платформа = Web"));
        Assert.False(Matches("Платформа = Android"));
        Assert.True(Matches("type = Инцидент"));
        Assert.False(Matches("type = Bug"));
        Assert.Throws<ArgumentException>(() => Matches("Неизвестное = 1"));

        var otherTeam = new Quest { IssueKey = "X-1", CreatedAt = DateTime.UtcNow, Board = new Board { TeamId = Guid.NewGuid() } };
        Assert.False(JqlService.Matches(new JqlParser("Платформа = Web").Parse(), otherTeam,
            new JqlService.JqlContext(Guid.NewGuid(), DateTime.UtcNow, q => q.CreatedAt, custom)));
        Assert.True(JqlService.Matches(new JqlParser("Платформа IS EMPTY").Parse(), otherTeam,
            new JqlService.JqlContext(Guid.NewGuid(), DateTime.UtcNow, q => q.CreatedAt, custom)));
    }
}
