using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class TeamServiceAccountTests
{
    [Theory]
    [InlineData("canban9012@mail.ru", "canban9012@mail.ru", true)]
    [InlineData(" Canban9012@Mail.ru ", "other@x.ru, canban9012@mail.ru", true)]
    [InlineData("maxim7012@gmail.com", "canban9012@mail.ru", false)]
    [InlineData("canban9012@mail.ru", "", false)]
    [InlineData(null, "canban9012@mail.ru", false)]
    public void ServiceAccountsAreMatchedByEmail(string? email, string serviceEmails, bool expected) =>
        Assert.Equal(expected, TeamService.IsServiceAccount(email, serviceEmails));
}
