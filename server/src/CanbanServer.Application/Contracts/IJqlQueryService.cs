using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface IJqlQueryService
{
    JqlQuery Parse(string text);
    Task<JqlSearchResult> SearchAsync(string text, Guid userId, int page, int pageSize, Guid? boardId, CancellationToken ct);
}

public abstract record JqlNode;
public record JqlBinary(string Operator, JqlNode Left, JqlNode Right) : JqlNode;
public record JqlNot(JqlNode Operand) : JqlNode;
public record JqlPredicate(string Field, string Operator, IReadOnlyList<JqlValue> Values) : JqlNode;
public record JqlValue(string Value, bool IsFunction = false);
public record JqlOrder(string Field, bool Descending);
public record JqlQuery(JqlNode? Where, IReadOnlyList<JqlOrder> OrderBy);
