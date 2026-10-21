using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class ServiceDeskTests
{
    [Fact]
    public void ServiceDeskFeatureIsKnownAndIncludedInItHelp()
    {
        Assert.Contains("service-desk", SpaceTemplates.AllFeatures);
        var template = SpaceTemplates.Find("it-help");
        Assert.Contains("service-desk", SpaceTemplates.NormalizeFeatures(template.Features).Split(','));
        Assert.Contains("forms", SpaceTemplates.NormalizeFeatures(template.Features).Split(','));
    }

    [Fact]
    public void ServiceDeskPermissionsAreRegistered()
    {
        Assert.NotNull(JiraPermissions.Find(JiraPermissions.ServiceDeskAgent));
        Assert.NotNull(JiraPermissions.Find(JiraPermissions.ManageServiceDesk));
        Assert.NotNull(JiraPermissions.Find(JiraPermissions.ApproveRequests));
        Assert.Contains(JiraPermissions.All, p => p.Key == JiraPermissions.ServiceDeskAgent);
    }

    [Fact]
    public void ServiceDeskNotificationEventsAreRegistered()
    {
        Assert.Contains(NotificationEvents.All, e => e.Key == NotificationEvents.AgentReplied);
        Assert.Contains(NotificationEvents.All, e => e.Key == NotificationEvents.SlaWarning);
        Assert.Contains(NotificationEvents.All, e => e.Key == NotificationEvents.SlaBreached);
        Assert.Contains(NotificationEvents.All, e => e.Key == NotificationEvents.ApprovalPending);
        Assert.Contains(NotificationEvents.All, e => e.Key == NotificationEvents.ApprovalDecided);
    }

    [Fact]
    public void DefaultPermissionSchemeIncludesServiceDeskKeys()
    {
        var scheme = PermissionSchemeService.Default();
        Assert.True(scheme.Grants.ContainsKey(JiraPermissions.ServiceDeskAgent));
        Assert.True(scheme.Grants.ContainsKey(JiraPermissions.ManageServiceDesk));
        Assert.True(scheme.Grants.ContainsKey(JiraPermissions.ApproveRequests));
    }

    [Fact]
    public void ApprovalAndSlaStatusesAreStable()
    {
        Assert.Equal("pending", ApprovalStatuses.Pending);
        Assert.Equal("approved", ApprovalStatuses.Approved);
        Assert.Equal("rejected", ApprovalStatuses.Rejected);
        Assert.Equal("first_response", SlaMetrics.FirstResponse);
        Assert.Equal("resolution", SlaMetrics.Resolution);
        Assert.Equal("running", SlaClockStatuses.Running);
        Assert.Equal("breached", SlaClockStatuses.Breached);
    }
}
