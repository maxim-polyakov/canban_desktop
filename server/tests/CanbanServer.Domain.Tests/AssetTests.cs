using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class AssetTests
{
    private const string Me = "11111111-1111-1111-1111-111111111111";

    private static AssetObjectView Laptop() => new AssetObjectView { Id = Guid.NewGuid() }
        .Add("key", "ITA-1").Add("label", "MacBook Pro 14")
        .Add("objectType", "Ноутбук").Add("objectTypeAndChildren", "Оборудование").Add("objectTypeAndChildren", "Ноутбук")
        .Add("Статус", "В использовании").Add("Владелец", Me).Add("Владелец", "Максим")
        .Add("Стоимость", "185000").Add("Гарантия до", "2026-03-01").Add("linkedIssues", "KAN-7");

    [Theory]
    [InlineData("objectType = \"Ноутбук\"", true)]
    [InlineData("objectType = Сервер", false)]
    [InlineData("objectTypeAndChildren = \"Оборудование\"", true)]
    [InlineData("\"Владелец\" = currentUser()", true)]
    [InlineData("Владелец = \"максим\"", true)]
    [InlineData("Стоимость > 100000 AND Стоимость <= 185000", true)]
    [InlineData("Стоимость < 1000", false)]
    [InlineData("\"Гарантия до\" < 2026-06-01", true)]
    [InlineData("\"Гарантия до\" = 2026-03-01", true)]
    [InlineData("Name ~ macbook", true)]
    [InlineData("label !~ macbook", false)]
    [InlineData("Статус IN (\"На складе\", \"В использовании\")", true)]
    [InlineData("Статус NOT IN (\"Списан\")", true)]
    [InlineData("\"Серийный номер\" IS EMPTY", true)]
    [InlineData("\"Серийный номер\" IS NOT EMPTY", false)]
    [InlineData("linkedIssues = KAN-7", true)]
    [InlineData("NOT (objectType = Ноутбук OR key = ITA-2)", false)]
    public void EvaluatesAqlPredicates(string aql, bool expected)
    {
        var query = AqlEvaluator.Parse(aql);
        Assert.Equal(expected, AqlEvaluator.Matches(query.Where, Laptop(), Me));
    }

    [Fact]
    public void PlainTextSearchesLabelAndKey()
    {
        var query = AqlEvaluator.ParseOrText("MacBook Pro");
        Assert.True(AqlEvaluator.Matches(query.Where, Laptop(), Me));
        Assert.True(AqlEvaluator.Matches(AqlEvaluator.ParseOrText("ita-1").Where, Laptop(), Me));
        Assert.Null(AqlEvaluator.ParseOrText("  ").Where);
    }

    [Fact]
    public void BrokenAqlWithOperatorsIsReported()
    {
        Assert.Throws<FormatException>(() => AqlEvaluator.ParseOrText("objectType = "));
        Assert.Throws<FormatException>(() => AqlEvaluator.Matches(AqlEvaluator.Parse("x = unknownFn()").Where, Laptop(), Me));
    }

    [Fact]
    public void OrdersByNumericAttribute()
    {
        var a = new AssetObjectView { Id = Guid.NewGuid() }.Add("label", "a").Add("Стоимость", "900");
        var b = new AssetObjectView { Id = Guid.NewGuid() }.Add("label", "b").Add("Стоимость", "10000");
        var sorted = AqlEvaluator.Order(new[] { b, a }, AqlEvaluator.Parse("ORDER BY Стоимость").OrderBy).ToList();
        Assert.Equal(a.Id, sorted[0].Id);
        var desc = AqlEvaluator.Order(new[] { a, b }, AqlEvaluator.Parse("ORDER BY Стоимость DESC").OrderBy).ToList();
        Assert.Equal(b.Id, desc[0].Id);
    }

    [Fact]
    public void CsvHandlesQuotesSeparatorsAndBom()
    {
        var rows = AssetCsv.Read("\uFEFFНазвание,Описание\r\n\"Сервер, основной\",\"Сказал \"\"привет\"\"\nвторая строка\"\r\n\r\nМонитор,\n");
        Assert.Equal(3, rows.Count);
        Assert.Equal("Сервер, основной", rows[1][0]);
        Assert.Equal("Сказал \"привет\"\nвторая строка", rows[1][1]);
        Assert.Equal(new[] { "Монитор", "" }, rows[2]);

        var semicolon = AssetCsv.Read("Название;Город\nОфис;Москва");
        Assert.Equal("Москва", semicolon[1][1]);

        var written = AssetCsv.Write(new[] { new[] { "a,b", "c\"d", null } });
        Assert.Equal("\"a,b\",\"c\"\"d\",\r\n", written);
        Assert.Equal(new[] { "a,b", "c\"d", "" }, AssetCsv.Read(written)[0]);
    }

    [Theory]
    [InlineData(AssetAttributeType.Number, "1 234,5", "1234.5")]
    [InlineData(AssetAttributeType.Date, "01.03.2026", "2026-03-01")]
    [InlineData(AssetAttributeType.Boolean, "Да", "true")]
    [InlineData(AssetAttributeType.Status, "на складе", "На складе")]
    [InlineData(AssetAttributeType.Email, "Admin@Example.com", "admin@example.com")]
    [InlineData(AssetAttributeType.Url, "https://example.com/x", "https://example.com/x")]
    public void NormalizesValues(AssetAttributeType type, string input, string expected)
    {
        var attribute = new AssetAttribute { Name = "A", Type = type, Options = "В использовании\nНа складе" };
        Assert.Equal(expected, AssetService.NormalizeScalar(attribute, input));
    }

    [Theory]
    [InlineData(AssetAttributeType.Number, "много")]
    [InlineData(AssetAttributeType.Date, "вчера")]
    [InlineData(AssetAttributeType.Status, "Потерян")]
    [InlineData(AssetAttributeType.Url, "ftp://x")]
    [InlineData(AssetAttributeType.Email, "no-at-sign")]
    public void RejectsInvalidValues(AssetAttributeType type, string input)
    {
        var attribute = new AssetAttribute { Name = "A", Type = type, Options = "В использовании" };
        Assert.Throws<ArgumentException>(() => AssetService.NormalizeScalar(attribute, input));
    }

    [Fact]
    public void ChildTypesInheritParentAttributesRootFirst()
    {
        var hardware = new AssetObjectType { Id = Guid.NewGuid(), Name = "Оборудование" };
        var laptop = new AssetObjectType { Id = Guid.NewGuid(), Name = "Ноутбук", ParentTypeId = hardware.Id };
        var other = new AssetObjectType { Id = Guid.NewGuid(), Name = "Офис" };
        var attributes = new[]
        {
            new AssetAttribute { Id = Guid.NewGuid(), ObjectTypeId = laptop.Id, Name = "Модель", Position = 0 },
            new AssetAttribute { Id = Guid.NewGuid(), ObjectTypeId = hardware.Id, Name = "Владелец", Position = 1 },
            new AssetAttribute { Id = Guid.NewGuid(), ObjectTypeId = hardware.Id, Name = "Статус", Position = 0 },
            new AssetAttribute { Id = Guid.NewGuid(), ObjectTypeId = other.Id, Name = "Город", Position = 0 },
        };
        var types = new[] { hardware, laptop, other };
        var effective = AssetService.EffectiveAttributes(laptop.Id, types, attributes).Select(a => a.Name);
        Assert.Equal(new[] { "Статус", "Владелец", "Модель" }, effective);
        Assert.Equal(new[] { laptop.Id }, AssetService.Descendants(hardware.Id, types));
    }
}
