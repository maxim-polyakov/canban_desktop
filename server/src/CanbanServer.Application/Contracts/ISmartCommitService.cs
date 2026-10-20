using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface ISmartCommitService
{
    /// <summary>Runs "#comment", "#time" and transition commands as the user whose email matches the commit author.</summary>
    Task ExecuteAsync(IReadOnlyList<SmartCommitRequest> commits, CancellationToken ct);
}
