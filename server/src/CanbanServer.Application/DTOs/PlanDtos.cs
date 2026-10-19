namespace CanbanServer.Application.DTOs;

public record PlanSourceRequest(string Kind, Guid? BoardId, Guid? FilterId);

public record CreatePlanRequest(
    string Name,
    string? Description,
    string? Access,
    List<PlanSourceRequest>? Sources,
    int? ExcludeDoneAfterDays = 30,
    List<int>? ExcludedIssueTypes = null);

public record UpdatePlanRequest(
    string? Name,
    string? Description,
    string? Access,
    int? ExcludeDoneAfterDays,
    bool? ShowAllDone,
    List<int>? ExcludedIssueTypes,
    List<PlanSourceRequest>? Sources);

public record PlanTeamRequest(string Name, Guid? TeamId, int? Capacity, int? IterationDays);

public record PlanScenarioRequest(string Name, string? Color, Guid? CopyFromScenarioId);

public record PlanScheduleRequest(DateTime? StartDate, DateTime? DueDate, Guid? PlanTeamId, bool ClearTeam = false);

public record PlanDependencyRequest(Guid BlockerQuestId, Guid BlockedQuestId);

public record PlanExclusionRequest(Guid QuestId);
