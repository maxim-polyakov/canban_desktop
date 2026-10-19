using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class EmailPreferenceTests
{
    private static readonly Guid Actor = Guid.NewGuid();

    private static User NewUser(Action<User>? configure = null)
    {
        var user = new User { Id = Guid.NewGuid(), Email = "u@example.com" };
        configure?.Invoke(user);
        return user;
    }

    [Fact]
    public void Watchers_GetEmailsByDefault()
    {
        Assert.True(QuestNotificationService.ShouldEmail(NewUser(), Actor, isAssignee: false, isReporter: false));
    }

    [Fact]
    public void MasterSwitch_DisablesAllEmails()
    {
        var user = NewUser(u => u.EmailNotificationsEnabled = false);
        Assert.False(QuestNotificationService.ShouldEmail(user, Actor, isAssignee: true, isReporter: true));
    }

    [Fact]
    public void OwnChanges_AreSkippedUnlessEnabled()
    {
        var user = NewUser();
        Assert.False(QuestNotificationService.ShouldEmail(user, user.Id, isAssignee: true, isReporter: false));
        user.EmailOwnChanges = true;
        Assert.True(QuestNotificationService.ShouldEmail(user, user.Id, isAssignee: true, isReporter: false));
    }

    [Fact]
    public void RoleSwitches_ApplyToAssigneesAndReporters()
    {
        var user = NewUser(u => u.EmailWhenAssignee = false);
        Assert.False(QuestNotificationService.ShouldEmail(user, Actor, isAssignee: true, isReporter: false));
        Assert.True(QuestNotificationService.ShouldEmail(user, Actor, isAssignee: true, isReporter: true));
        user.EmailWhenReporter = false;
        Assert.False(QuestNotificationService.ShouldEmail(user, Actor, isAssignee: true, isReporter: true));
    }
}
