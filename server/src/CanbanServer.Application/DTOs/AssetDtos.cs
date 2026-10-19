using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.DTOs;

public record CreateAssetSchemaRequest(string Name, string Key, string? Description, Guid TeamId, string? Template);
public record UpdateAssetSchemaRequest(string Name, string? Description);
public record UpsertAssetObjectTypeRequest(string Name, string? Description, Guid? ParentTypeId, string? Icon);
public record UpsertAssetAttributeRequest(string Name, AssetAttributeType Type, bool Required, string? Options, Guid? ReferenceTypeId);
public record SaveAssetObjectRequest(Guid ObjectTypeId, string Label, Dictionary<Guid, string?>? Values);
public record LinkAssetIssueRequest(string? IssueKey, Guid? QuestId);
public record ImportAssetsRequest(string Content);
