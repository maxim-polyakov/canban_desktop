using System.Globalization;
using System.Text.RegularExpressions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Jira-like Assets (CMDB): schemas owned by a team, typed objects with attributes, references and issue links.</summary>
public class AssetService
{
    private const int MaxSearchObjects = 10000;
    private static readonly Regex KeyPattern = new("^[A-Z][A-Z0-9]{1,9}$", RegexOptions.Compiled);
    private static readonly string[] Icons = { "box", "laptop", "server", "monitor", "phone", "license", "software", "location", "person", "service", "network", "folder" };

    private readonly CanbanDbContext _db;
    private readonly IProjectAccessService _access;

    public AssetService(CanbanDbContext db, IProjectAccessService access)
    {
        _db = db;
        _access = access;
    }

    // ---------- access ----------

    private async Task<Dictionary<Guid, BoardPermission>> TeamPermissionsAsync(Guid userId, CancellationToken ct)
    {
        var result = new Dictionary<Guid, BoardPermission>();
        var memberships = await _db.TeamMembers.AsNoTracking().Where(m => m.UserId == userId)
            .Select(m => new { m.TeamId, m.Role }).ToListAsync(ct);
        foreach (var m in memberships) result[m.TeamId] = _access.MapRole(m.Role, false);
        var owned = await _db.Teams.AsNoTracking().Where(t => t.OwnerId == userId).Select(t => t.Id).ToListAsync(ct);
        foreach (var id in owned) result[id] = BoardPermission.Admin;
        return result;
    }

    private async Task<(AssetSchema Schema, BoardPermission Permission)> RequireSchemaAsync(Guid schemaId, Guid userId, BoardPermission required, CancellationToken ct)
    {
        var schema = await _db.AssetSchemas.FirstOrDefaultAsync(s => s.Id == schemaId, ct)
            ?? throw new KeyNotFoundException("Схема объектов не найдена");
        var (status, permission) = await _access.GetTeamAccessAsync(schema.TeamId, userId, ct);
        if (status != ProjectAccessStatus.Success || permission == null) throw new KeyNotFoundException("Схема объектов не найдена");
        if ((int)permission.Value < (int)required) throw new UnauthorizedAccessException("Недостаточно прав для этой схемы объектов");
        return (schema, permission.Value);
    }

    private async Task<(AssetObjectType Type, AssetSchema Schema)> RequireTypeAsync(Guid typeId, Guid userId, BoardPermission required, CancellationToken ct)
    {
        var type = await _db.AssetObjectTypes.FirstOrDefaultAsync(t => t.Id == typeId, ct)
            ?? throw new KeyNotFoundException("Тип объектов не найден");
        var (schema, _) = await RequireSchemaAsync(type.SchemaId, userId, required, ct);
        return (type, schema);
    }

    private async Task<(AssetObject Object, AssetSchema Schema, BoardPermission Permission)> RequireObjectAsync(Guid objectId, Guid userId, BoardPermission required, CancellationToken ct)
    {
        var obj = await _db.AssetObjects.FirstOrDefaultAsync(o => o.Id == objectId, ct)
            ?? throw new KeyNotFoundException("Объект не найден");
        var (schema, permission) = await RequireSchemaAsync(obj.SchemaId, userId, required, ct);
        return (obj, schema, permission);
    }

    // ---------- schemas ----------

    public async Task<object> GetSchemasAsync(Guid userId, CancellationToken ct)
    {
        var permissions = await TeamPermissionsAsync(userId, ct);
        var teamIds = permissions.Keys.ToList();
        var schemas = await _db.AssetSchemas.AsNoTracking().Where(s => teamIds.Contains(s.TeamId)).OrderBy(s => s.Name).ToListAsync(ct);
        var ids = schemas.Select(s => s.Id).ToList();
        var objectCounts = await _db.AssetObjects.AsNoTracking().Where(o => ids.Contains(o.SchemaId))
            .GroupBy(o => o.SchemaId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var typeCounts = await _db.AssetObjectTypes.AsNoTracking().Where(t => ids.Contains(t.SchemaId))
            .GroupBy(t => t.SchemaId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var teamNames = await _db.Teams.AsNoTracking().Where(t => teamIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.Name, ct);
        return schemas.Select(s => new
        {
            s.Id, s.Name, s.Key, s.Description, s.TeamId, s.CreatedAt, s.UpdatedAt,
            TeamName = teamNames.GetValueOrDefault(s.TeamId),
            ObjectCount = objectCounts.GetValueOrDefault(s.Id),
            TypeCount = typeCounts.GetValueOrDefault(s.Id),
            Permission = permissions[s.TeamId],
        }).ToList();
    }

    public async Task<object> CreateSchemaAsync(Guid userId, CreateAssetSchemaRequest request, CancellationToken ct)
    {
        var (status, permission) = await _access.GetTeamAccessAsync(request.TeamId, userId, ct);
        if (status == ProjectAccessStatus.NotFound) throw new KeyNotFoundException("Команда не найдена");
        if (status != ProjectAccessStatus.Success || permission == null || (int)permission.Value < (int)BoardPermission.Manage)
            throw new UnauthorizedAccessException("Создавать схемы могут руководители и администраторы команды");
        var name = RequireName(request.Name, "Название схемы");
        var key = (request.Key ?? "").Trim().ToUpperInvariant();
        if (!KeyPattern.IsMatch(key)) throw new ArgumentException("Ключ: 2–10 латинских букв или цифр, начиная с буквы");
        if (await _db.AssetSchemas.AnyAsync(s => s.Key == key, ct)) throw new ArgumentException($"Ключ {key} уже занят");

        var now = DateTime.UtcNow;
        var schema = new AssetSchema
        {
            Id = Guid.NewGuid(), TeamId = request.TeamId, Name = name, Key = key,
            Description = Trim(request.Description), CreatedByUserId = userId, CreatedAt = now, UpdatedAt = now,
        };
        _db.AssetSchemas.Add(schema);
        AssetSchemaTemplates.Apply(_db, schema, request.Template);
        await _db.SaveChangesAsync(ct);
        return await GetSchemaAsync(schema.Id, userId, ct);
    }

    public async Task<object> GetSchemaAsync(Guid schemaId, Guid userId, CancellationToken ct)
    {
        var (schema, permission) = await RequireSchemaAsync(schemaId, userId, BoardPermission.View, ct);
        var types = await _db.AssetObjectTypes.AsNoTracking().Where(t => t.SchemaId == schemaId).OrderBy(t => t.Position).ThenBy(t => t.Name).ToListAsync(ct);
        var typeIds = types.Select(t => t.Id).ToList();
        var attributes = await _db.AssetAttributes.AsNoTracking().Where(a => typeIds.Contains(a.ObjectTypeId)).OrderBy(a => a.Position).ToListAsync(ct);
        var counts = await _db.AssetObjects.AsNoTracking().Where(o => o.SchemaId == schemaId)
            .GroupBy(o => o.ObjectTypeId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var teamName = await _db.Teams.AsNoTracking().Where(t => t.Id == schema.TeamId).Select(t => t.Name).FirstOrDefaultAsync(ct);
        return new
        {
            schema.Id, schema.Name, schema.Key, schema.Description, schema.TeamId, TeamName = teamName,
            schema.CreatedAt, schema.UpdatedAt, Permission = permission,
            ObjectCount = counts.Values.Sum(),
            Types = types.Select(t => new
            {
                t.Id, t.ParentTypeId, t.Name, t.Description, t.Icon, t.Position,
                ObjectCount = counts.GetValueOrDefault(t.Id),
                Attributes = attributes.Where(a => a.ObjectTypeId == t.Id).Select(AttributeDto).ToList(),
                EffectiveAttributes = EffectiveAttributes(t.Id, types, attributes).Select(AttributeDto).ToList(),
            }).ToList(),
        };
    }

    public async Task<object> UpdateSchemaAsync(Guid schemaId, Guid userId, UpdateAssetSchemaRequest request, CancellationToken ct)
    {
        var (schema, _) = await RequireSchemaAsync(schemaId, userId, BoardPermission.Manage, ct);
        schema.Name = RequireName(request.Name, "Название схемы");
        schema.Description = Trim(request.Description);
        schema.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return await GetSchemaAsync(schemaId, userId, ct);
    }

    public async Task DeleteSchemaAsync(Guid schemaId, Guid userId, CancellationToken ct)
    {
        var (schema, _) = await RequireSchemaAsync(schemaId, userId, BoardPermission.Admin, ct);
        await _db.AssetObjects.Where(o => o.SchemaId == schemaId).ExecuteDeleteAsync(ct);
        var types = await _db.AssetObjectTypes.Where(t => t.SchemaId == schemaId).ToListAsync(ct);
        foreach (var t in types) t.ParentTypeId = null;
        await _db.SaveChangesAsync(ct);
        _db.AssetSchemas.Remove(schema);
        await _db.SaveChangesAsync(ct);
    }

    // ---------- object types ----------

    public async Task<Guid> CreateTypeAsync(Guid schemaId, Guid userId, UpsertAssetObjectTypeRequest request, CancellationToken ct)
    {
        await RequireSchemaAsync(schemaId, userId, BoardPermission.Manage, ct);
        var type = new AssetObjectType { Id = Guid.NewGuid(), SchemaId = schemaId };
        await ApplyTypeAsync(type, request, ct);
        type.Position = await _db.AssetObjectTypes.Where(t => t.SchemaId == schemaId).Select(t => (int?)t.Position).MaxAsync(ct) + 1 ?? 0;
        _db.AssetObjectTypes.Add(type);
        await _db.SaveChangesAsync(ct);
        return type.Id;
    }

    public async Task UpdateTypeAsync(Guid typeId, Guid userId, UpsertAssetObjectTypeRequest request, CancellationToken ct)
    {
        var (type, _) = await RequireTypeAsync(typeId, userId, BoardPermission.Manage, ct);
        await ApplyTypeAsync(type, request, ct);
        await _db.SaveChangesAsync(ct);
    }

    private async Task ApplyTypeAsync(AssetObjectType type, UpsertAssetObjectTypeRequest request, CancellationToken ct)
    {
        var name = RequireName(request.Name, "Название типа");
        if (await _db.AssetObjectTypes.AnyAsync(t => t.SchemaId == type.SchemaId && t.Name == name && t.Id != type.Id, ct))
            throw new ArgumentException($"Тип «{name}» уже есть в схеме");
        if (request.ParentTypeId.HasValue)
        {
            var all = await _db.AssetObjectTypes.AsNoTracking().Where(t => t.SchemaId == type.SchemaId).ToDictionaryAsync(t => t.Id, ct);
            if (!all.ContainsKey(request.ParentTypeId.Value)) throw new ArgumentException("Родительский тип не найден в этой схеме");
            for (Guid? cursor = request.ParentTypeId; cursor.HasValue; cursor = all.GetValueOrDefault(cursor.Value)?.ParentTypeId)
                if (cursor == type.Id) throw new ArgumentException("Тип не может быть вложен сам в себя");
        }
        type.Name = name;
        type.Description = Trim(request.Description);
        type.ParentTypeId = request.ParentTypeId;
        type.Icon = Icons.Contains(request.Icon) ? request.Icon! : string.IsNullOrEmpty(type.Icon) ? "box" : type.Icon;
    }

    public async Task DeleteTypeAsync(Guid typeId, Guid userId, CancellationToken ct)
    {
        var (type, _) = await RequireTypeAsync(typeId, userId, BoardPermission.Manage, ct);
        if (await _db.AssetObjectTypes.AnyAsync(t => t.ParentTypeId == typeId, ct))
            throw new InvalidOperationException("Сначала удалите или перенесите дочерние типы");
        if (await _db.AssetObjects.AnyAsync(o => o.ObjectTypeId == typeId, ct))
            throw new InvalidOperationException("В типе есть объекты. Удалите их, прежде чем удалять тип");
        var referencing = await _db.AssetAttributes.Where(a => a.ReferenceTypeId == typeId).ToListAsync(ct);
        foreach (var a in referencing) a.ReferenceTypeId = null;
        _db.AssetObjectTypes.Remove(type);
        await _db.SaveChangesAsync(ct);
    }

    // ---------- attributes ----------

    public async Task<Guid> CreateAttributeAsync(Guid typeId, Guid userId, UpsertAssetAttributeRequest request, CancellationToken ct)
    {
        var (type, _) = await RequireTypeAsync(typeId, userId, BoardPermission.Manage, ct);
        var attribute = new AssetAttribute { Id = Guid.NewGuid(), ObjectTypeId = typeId };
        await ApplyAttributeAsync(attribute, type.SchemaId, request, hasValues: false, ct);
        attribute.Position = await _db.AssetAttributes.Where(a => a.ObjectTypeId == typeId).Select(a => (int?)a.Position).MaxAsync(ct) + 1 ?? 0;
        _db.AssetAttributes.Add(attribute);
        await _db.SaveChangesAsync(ct);
        return attribute.Id;
    }

    public async Task UpdateAttributeAsync(Guid attributeId, Guid userId, UpsertAssetAttributeRequest request, CancellationToken ct)
    {
        var attribute = await _db.AssetAttributes.FirstOrDefaultAsync(a => a.Id == attributeId, ct) ?? throw new KeyNotFoundException("Атрибут не найден");
        var (type, _) = await RequireTypeAsync(attribute.ObjectTypeId, userId, BoardPermission.Manage, ct);
        var hasValues = await _db.AssetAttributeValues.AnyAsync(v => v.AttributeId == attributeId, ct);
        await ApplyAttributeAsync(attribute, type.SchemaId, request, hasValues, ct);
        await _db.SaveChangesAsync(ct);
    }

    private async Task ApplyAttributeAsync(AssetAttribute attribute, Guid schemaId, UpsertAssetAttributeRequest request, bool hasValues, CancellationToken ct)
    {
        var name = RequireName(request.Name, "Название атрибута");
        if (IsReservedName(name)) throw new ArgumentException($"«{name}» — системное поле, выберите другое название");
        if (await _db.AssetAttributes.AnyAsync(a => a.ObjectTypeId == attribute.ObjectTypeId && a.Name == name && a.Id != attribute.Id, ct))
            throw new ArgumentException($"Атрибут «{name}» уже есть у этого типа");
        if (!Enum.IsDefined(request.Type)) throw new ArgumentException("Неизвестный тип атрибута");
        if (hasValues && attribute.Type != request.Type) throw new InvalidOperationException("Нельзя менять тип атрибута, у которого уже есть значения");
        var options = ParseOptions(request.Options);
        if (request.Type is AssetAttributeType.Select or AssetAttributeType.Status && options.Count == 0)
            throw new ArgumentException("Укажите хотя бы один вариант значения");
        if (request.Type == AssetAttributeType.Reference)
        {
            if (!request.ReferenceTypeId.HasValue) throw new ArgumentException("Выберите тип объектов, на который ссылается атрибут");
            if (!await _db.AssetObjectTypes.AnyAsync(t => t.Id == request.ReferenceTypeId && t.SchemaId == schemaId, ct))
                throw new ArgumentException("Тип для ссылки не найден в этой схеме");
        }
        attribute.Name = name;
        attribute.Type = request.Type;
        attribute.Required = request.Required;
        attribute.Options = options.Count > 0 ? string.Join('\n', options) : null;
        attribute.ReferenceTypeId = request.Type == AssetAttributeType.Reference ? request.ReferenceTypeId : null;
    }

    public async Task DeleteAttributeAsync(Guid attributeId, Guid userId, CancellationToken ct)
    {
        var attribute = await _db.AssetAttributes.FirstOrDefaultAsync(a => a.Id == attributeId, ct) ?? throw new KeyNotFoundException("Атрибут не найден");
        await RequireTypeAsync(attribute.ObjectTypeId, userId, BoardPermission.Manage, ct);
        _db.AssetAttributes.Remove(attribute);
        await _db.SaveChangesAsync(ct);
    }

    // ---------- objects ----------

    public async Task<object> CreateObjectAsync(Guid userId, SaveAssetObjectRequest request, CancellationToken ct)
    {
        var (type, schema) = await RequireTypeAsync(request.ObjectTypeId, userId, BoardPermission.Work, ct);
        var ctx = await LoadSchemaContextAsync(schema.Id, ct);
        var now = DateTime.UtcNow;
        var obj = new AssetObject
        {
            Id = Guid.NewGuid(), SchemaId = schema.Id, ObjectTypeId = type.Id,
            Key = $"{schema.Key}-{schema.NextObjectNumber++}", Label = RequireName(request.Label, "Название объекта"),
            CreatedByUserId = userId, CreatedAt = now, UpdatedAt = now,
        };
        var values = await NormalizeValuesAsync(ctx, type.Id, request.Values ?? new(), obj.Id, ct);
        _db.AssetObjects.Add(obj);
        foreach (var (attribute, value, refId) in values)
            if (value != null || refId != null)
                _db.AssetAttributeValues.Add(new AssetAttributeValue { Id = Guid.NewGuid(), ObjectId = obj.Id, AttributeId = attribute.Id, Value = value, ReferencedObjectId = refId });
        _db.AssetObjectChanges.Add(new AssetObjectChange { Id = Guid.NewGuid(), ObjectId = obj.Id, UserId = userId, Field = "created", NewValue = obj.Label, CreatedAt = now });
        schema.UpdatedAt = now;
        await _db.SaveChangesAsync(ct);
        return await GetObjectAsync(obj.Id, userId, ct);
    }

    public async Task<object> UpdateObjectAsync(Guid objectId, Guid userId, SaveAssetObjectRequest request, CancellationToken ct)
    {
        var (obj, schema, _) = await RequireObjectAsync(objectId, userId, BoardPermission.Work, ct);
        var ctx = await LoadSchemaContextAsync(schema.Id, ct);
        if (!ctx.Types.ContainsKey(request.ObjectTypeId)) throw new ArgumentException("Тип объектов не найден в этой схеме");
        var now = DateTime.UtcNow;
        var changes = new List<AssetObjectChange>();
        void Track(string field, string? oldValue, string? newValue)
        {
            if (oldValue != newValue)
                changes.Add(new AssetObjectChange { Id = Guid.NewGuid(), ObjectId = obj.Id, UserId = userId, Field = field, OldValue = oldValue, NewValue = newValue, CreatedAt = now });
        }

        var label = RequireName(request.Label, "Название объекта");
        Track("label", obj.Label, label);
        obj.Label = label;
        if (obj.ObjectTypeId != request.ObjectTypeId)
        {
            Track("objectType", ctx.Types[obj.ObjectTypeId].Name, ctx.Types[request.ObjectTypeId].Name);
            obj.ObjectTypeId = request.ObjectTypeId;
        }

        var existing = await _db.AssetAttributeValues.Where(v => v.ObjectId == objectId).ToListAsync(ct);
        var normalized = await NormalizeValuesAsync(ctx, obj.ObjectTypeId, request.Values ?? new(), obj.Id, ct, existing);
        var keep = normalized.Select(n => n.Attribute.Id).ToHashSet();
        foreach (var stale in existing.Where(v => !keep.Contains(v.AttributeId)))
        {
            if (ctx.Attributes.TryGetValue(stale.AttributeId, out var a)) Track(a.Name, await DisplayAsync(ctx, a, stale.Value, stale.ReferencedObjectId, ct), null);
            _db.AssetAttributeValues.Remove(stale);
        }
        foreach (var (attribute, value, refId) in normalized)
        {
            var current = existing.FirstOrDefault(v => v.AttributeId == attribute.Id);
            var oldDisplay = current == null ? null : await DisplayAsync(ctx, attribute, current.Value, current.ReferencedObjectId, ct);
            var newDisplay = await DisplayAsync(ctx, attribute, value, refId, ct);
            Track(attribute.Name, oldDisplay, newDisplay);
            if (value == null && refId == null)
            {
                if (current != null) _db.AssetAttributeValues.Remove(current);
            }
            else if (current == null)
                _db.AssetAttributeValues.Add(new AssetAttributeValue { Id = Guid.NewGuid(), ObjectId = obj.Id, AttributeId = attribute.Id, Value = value, ReferencedObjectId = refId });
            else
            {
                current.Value = value;
                current.ReferencedObjectId = refId;
            }
        }
        if (changes.Count > 0)
        {
            obj.UpdatedAt = now;
            schema.UpdatedAt = now;
            _db.AssetObjectChanges.AddRange(changes);
        }
        await _db.SaveChangesAsync(ct);
        return await GetObjectAsync(obj.Id, userId, ct);
    }

    public async Task DeleteObjectAsync(Guid objectId, Guid userId, CancellationToken ct)
    {
        var (obj, _, _) = await RequireObjectAsync(objectId, userId, BoardPermission.Work, ct);
        _db.AssetObjects.Remove(obj);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<object> GetObjectAsync(Guid objectId, Guid userId, CancellationToken ct)
    {
        var (obj, schema, permission) = await RequireObjectAsync(objectId, userId, BoardPermission.View, ct);
        var ctx = await LoadSchemaContextAsync(schema.Id, ct);
        var values = await _db.AssetAttributeValues.AsNoTracking().Where(v => v.ObjectId == objectId).ToListAsync(ct);
        var effective = EffectiveAttributes(obj.ObjectTypeId, ctx.Types.Values, ctx.Attributes.Values);
        var attributeValues = new List<object>();
        foreach (var a in effective)
        {
            var v = values.FirstOrDefault(x => x.AttributeId == a.Id);
            attributeValues.Add(new
            {
                Attribute = AttributeDto(a),
                Value = v?.Value,
                v?.ReferencedObjectId,
                Display = v == null ? null : await DisplayAsync(ctx, a, v.Value, v.ReferencedObjectId, ct),
                Reference = v?.ReferencedObjectId is Guid rid ? await ObjectSummaryAsync(rid, ct) : null,
            });
        }

        var inbound = await (from v in _db.AssetAttributeValues.AsNoTracking()
                             join o in _db.AssetObjects.AsNoTracking() on v.ObjectId equals o.Id
                             join a in _db.AssetAttributes.AsNoTracking() on v.AttributeId equals a.Id
                             where v.ReferencedObjectId == objectId
                             select new { o.Id, o.Key, o.Label, o.ObjectTypeId, AttributeName = a.Name }).ToListAsync(ct);

        var issueIds = await _db.AssetQuestLinks.AsNoTracking().Where(l => l.ObjectId == objectId).Select(l => l.QuestId).ToListAsync(ct);
        var teamIds = (await TeamPermissionsAsync(userId, ct)).Keys.ToList();
        var issues = await _db.Quests.AsNoTracking()
            .Where(q => issueIds.Contains(q.Id) && teamIds.Contains(q.Board.TeamId))
            .Select(q => new { q.Id, q.IssueKey, q.Title, q.BoardId, q.IssueType, q.Priority, Status = q.Column.Title, StatusKind = q.Column.Kind, q.CompletedAt })
            .ToListAsync(ct);

        var history = await _db.AssetObjectChanges.AsNoTracking().Where(c => c.ObjectId == objectId)
            .OrderByDescending(c => c.CreatedAt).Take(100).ToListAsync(ct);
        var userIds = history.Where(h => h.UserId.HasValue).Select(h => h.UserId!.Value).Append(obj.CreatedByUserId).Distinct().ToList();
        var users = await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => new { u.Id, u.DisplayName, u.AvatarUrl }, ct);

        var type = ctx.Types[obj.ObjectTypeId];
        return new
        {
            obj.Id, obj.Key, obj.Label, obj.ObjectTypeId, obj.CreatedAt, obj.UpdatedAt,
            CreatedBy = users.GetValueOrDefault(obj.CreatedByUserId),
            Type = new { type.Id, type.Name, type.Icon, Path = TypePath(type.Id, ctx.Types).Select(t => t.Name).ToList() },
            Schema = new { schema.Id, schema.Name, schema.Key },
            Permission = permission,
            Attributes = attributeValues,
            InboundReferences = inbound.Select(i => new { i.Id, i.Key, i.Label, i.AttributeName, TypeName = ctx.Types.GetValueOrDefault(i.ObjectTypeId)?.Name, TypeIcon = ctx.Types.GetValueOrDefault(i.ObjectTypeId)?.Icon }).ToList(),
            Issues = issues,
            History = history.Select(h => new { h.Id, h.Field, h.OldValue, h.NewValue, h.CreatedAt, User = h.UserId.HasValue ? users.GetValueOrDefault(h.UserId.Value) : null }).ToList(),
        };
    }

    private async Task<object?> ObjectSummaryAsync(Guid id, CancellationToken ct) =>
        await _db.AssetObjects.AsNoTracking().Where(o => o.Id == id)
            .Select(o => new { o.Id, o.Key, o.Label, o.ObjectTypeId }).FirstOrDefaultAsync(ct);

    /// <summary>Objects reachable through reference attributes (both directions) up to <paramref name="depth"/> hops.</summary>
    public async Task<object> GetGraphAsync(Guid objectId, Guid userId, int depth, CancellationToken ct)
    {
        var (obj, schema, _) = await RequireObjectAsync(objectId, userId, BoardPermission.View, ct);
        depth = Math.Clamp(depth, 1, 3);
        var edges = await (from v in _db.AssetAttributeValues.AsNoTracking()
                           join o in _db.AssetObjects.AsNoTracking() on v.ObjectId equals o.Id
                           join a in _db.AssetAttributes.AsNoTracking() on v.AttributeId equals a.Id
                           where o.SchemaId == schema.Id && v.ReferencedObjectId != null
                           select new { From = v.ObjectId, To = v.ReferencedObjectId!.Value, Label = a.Name }).ToListAsync(ct);
        var visited = new HashSet<Guid> { obj.Id };
        var frontier = new List<Guid> { obj.Id };
        var used = new List<(Guid From, Guid To, string Label)>();
        for (var level = 0; level < depth && frontier.Count > 0; level++)
        {
            var next = new List<Guid>();
            foreach (var e in edges.Where(e => frontier.Contains(e.From) || frontier.Contains(e.To)))
            {
                if (!used.Contains((e.From, e.To, e.Label))) used.Add((e.From, e.To, e.Label));
                foreach (var n in new[] { e.From, e.To })
                    if (visited.Add(n)) next.Add(n);
            }
            frontier = next;
            if (visited.Count > 60) break;
        }
        var ids = visited.ToList();
        var types = await _db.AssetObjectTypes.AsNoTracking().Where(t => t.SchemaId == schema.Id).ToDictionaryAsync(t => t.Id, ct);
        var nodes = await _db.AssetObjects.AsNoTracking().Where(o => ids.Contains(o.Id))
            .Select(o => new { o.Id, o.Key, o.Label, o.ObjectTypeId }).ToListAsync(ct);
        return new
        {
            RootId = obj.Id,
            Nodes = nodes.Select(n => new { n.Id, n.Key, n.Label, TypeName = types.GetValueOrDefault(n.ObjectTypeId)?.Name, Icon = types.GetValueOrDefault(n.ObjectTypeId)?.Icon }).ToList(),
            Edges = used.Where(e => visited.Contains(e.From) && visited.Contains(e.To)).Select(e => new { e.From, e.To, e.Label }).ToList(),
        };
    }

    // ---------- search ----------

    public async Task<object> SearchAsync(Guid userId, string? aql, Guid? schemaId, Guid? typeId, bool includeChildren, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = AqlEvaluator.ParseOrText(aql ?? "");
        var permissions = await TeamPermissionsAsync(userId, ct);
        var teamIds = permissions.Keys.ToList();
        var schemas = await _db.AssetSchemas.AsNoTracking()
            .Where(s => teamIds.Contains(s.TeamId) && (!schemaId.HasValue || s.Id == schemaId)).ToDictionaryAsync(s => s.Id, ct);
        var schemaIds = schemas.Keys.ToList();
        var types = await _db.AssetObjectTypes.AsNoTracking().Where(t => schemaIds.Contains(t.SchemaId)).ToDictionaryAsync(t => t.Id, ct);
        var typeIds = types.Keys.ToList();
        var attributes = await _db.AssetAttributes.AsNoTracking().Where(a => typeIds.Contains(a.ObjectTypeId)).ToDictionaryAsync(a => a.Id, ct);

        var objectsQuery = _db.AssetObjects.AsNoTracking().Where(o => schemaIds.Contains(o.SchemaId));
        if (typeId.HasValue)
        {
            var scope = includeChildren ? Descendants(typeId.Value, types.Values).Append(typeId.Value).ToList() : new List<Guid> { typeId.Value };
            objectsQuery = objectsQuery.Where(o => scope.Contains(o.ObjectTypeId));
        }
        var objects = await objectsQuery.OrderBy(o => o.Label).Take(MaxSearchObjects).ToListAsync(ct);
        var objectIds = objects.Select(o => o.Id).ToList();
        var values = await _db.AssetAttributeValues.AsNoTracking().Where(v => objectIds.Contains(v.ObjectId)).ToListAsync(ct);
        var refIds = values.Where(v => v.ReferencedObjectId.HasValue).Select(v => v.ReferencedObjectId!.Value).Distinct().ToList();
        var refs = await _db.AssetObjects.AsNoTracking().Where(o => refIds.Contains(o.Id))
            .ToDictionaryAsync(o => o.Id, o => new { o.Key, o.Label }, ct);
        var userIds = values.Where(v => attributes.GetValueOrDefault(v.AttributeId)?.Type == AssetAttributeType.User && Guid.TryParse(v.Value, out _))
            .Select(v => Guid.Parse(v.Value!)).Distinct().ToList();
        var users = await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => new { u.DisplayName, u.Email }, ct);
        var issueKeys = await (from l in _db.AssetQuestLinks.AsNoTracking()
                               join q in _db.Quests.AsNoTracking() on l.QuestId equals q.Id
                               where objectIds.Contains(l.ObjectId)
                               select new { l.ObjectId, q.IssueKey }).ToListAsync(ct);
        var valuesByObject = values.ToLookup(v => v.ObjectId);
        var issuesByObject = issueKeys.ToLookup(i => i.ObjectId, i => i.IssueKey);

        string? Display(AssetAttribute a, AssetAttributeValue v) => a.Type switch
        {
            AssetAttributeType.Reference => v.ReferencedObjectId is Guid r && refs.TryGetValue(r, out var o) ? $"{o.Label} ({o.Key})" : null,
            AssetAttributeType.User => Guid.TryParse(v.Value, out var u) && users.TryGetValue(u, out var user) ? user.DisplayName : v.Value,
            _ => v.Value,
        };

        var views = new List<AssetObjectView>();
        var byId = objects.ToDictionary(o => o.Id);
        foreach (var o in objects)
        {
            var view = new AssetObjectView { Id = o.Id }
                .Add("key", o.Key).Add("label", o.Label).Add("objectId", o.Id.ToString())
                .Add("objectType", types.GetValueOrDefault(o.ObjectTypeId)?.Name)
                .Add("schema", schemas.GetValueOrDefault(o.SchemaId)?.Name).Add("schemaKey", schemas.GetValueOrDefault(o.SchemaId)?.Key)
                .Add("created", o.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture))
                .Add("updated", o.UpdatedAt.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture));
            foreach (var t in TypePath(o.ObjectTypeId, types)) view.Add("objectTypeAndChildren", t.Name);
            foreach (var key in issuesByObject[o.Id]) view.Add("linkedIssues", key);
            foreach (var v in valuesByObject[o.Id])
            {
                if (!attributes.TryGetValue(v.AttributeId, out var a)) continue;
                if (a.Type == AssetAttributeType.Reference && v.ReferencedObjectId is Guid r && refs.TryGetValue(r, out var target))
                    view.Add(a.Name, target.Label).Add(a.Name, target.Key);
                else if (a.Type == AssetAttributeType.User && Guid.TryParse(v.Value, out var u))
                {
                    view.Add(a.Name, v.Value);
                    if (users.TryGetValue(u, out var user)) view.Add(a.Name, user.DisplayName).Add(a.Name, user.Email);
                }
                else view.Add(a.Name, v.Value);
            }
            views.Add(view);
        }

        var matched = AqlEvaluator.Order(views.Where(v => AqlEvaluator.Matches(query.Where, v, userId.ToString())), query.OrderBy).ToList();
        var pageItems = matched.Skip((page - 1) * pageSize).Take(pageSize).Select(v => byId[v.Id]).ToList();

        List<AssetAttribute>? columns = typeId.HasValue && types.ContainsKey(typeId.Value)
            ? EffectiveAttributes(typeId.Value, types.Values, attributes.Values) : null;

        return new
        {
            Total = matched.Count,
            Page = page,
            PageSize = pageSize,
            Truncated = objects.Count >= MaxSearchObjects,
            Columns = columns?.Select(AttributeDto).ToList(),
            Items = pageItems.Select(o => new
            {
                o.Id, o.Key, o.Label, o.ObjectTypeId, o.SchemaId, o.UpdatedAt, o.CreatedAt,
                TypeName = types.GetValueOrDefault(o.ObjectTypeId)?.Name,
                TypeIcon = types.GetValueOrDefault(o.ObjectTypeId)?.Icon,
                SchemaName = schemas.GetValueOrDefault(o.SchemaId)?.Name,
                SchemaKey = schemas.GetValueOrDefault(o.SchemaId)?.Key,
                IssueCount = issuesByObject[o.Id].Count(),
                Values = valuesByObject[o.Id].Where(v => attributes.ContainsKey(v.AttributeId))
                    .Select(v => new { v.AttributeId, v.Value, v.ReferencedObjectId, Display = Display(attributes[v.AttributeId], v) }).ToList(),
            }).ToList(),
        };
    }

    // ---------- issues ----------

    public async Task<object> LinkIssueAsync(Guid objectId, Guid userId, LinkAssetIssueRequest request, CancellationToken ct)
    {
        await RequireObjectAsync(objectId, userId, BoardPermission.View, ct);
        var quest = request.QuestId.HasValue
            ? await _db.Quests.AsNoTracking().FirstOrDefaultAsync(q => q.Id == request.QuestId, ct)
            : await FindQuestByKeyAsync(request.IssueKey, userId, ct);
        if (quest == null) throw new KeyNotFoundException("Задача не найдена");
        await _access.EnsureQuestPermissionAsync(quest.Id, userId, BoardPermission.Work, ct);
        if (!await _db.AssetQuestLinks.AnyAsync(l => l.ObjectId == objectId && l.QuestId == quest.Id, ct))
        {
            var now = DateTime.UtcNow;
            _db.AssetQuestLinks.Add(new AssetQuestLink { ObjectId = objectId, QuestId = quest.Id, CreatedByUserId = userId, CreatedAt = now });
            _db.AssetObjectChanges.Add(new AssetObjectChange { Id = Guid.NewGuid(), ObjectId = objectId, UserId = userId, Field = "issue", NewValue = quest.IssueKey, CreatedAt = now });
            _db.QuestChanges.Add(new QuestChange { Id = Guid.NewGuid(), QuestId = quest.Id, UserId = userId, ChangeType = "updated", Field = "assets", NewValue = await _db.AssetObjects.Where(o => o.Id == objectId).Select(o => o.Key).FirstAsync(ct), CreatedAt = now });
            await _db.SaveChangesAsync(ct);
        }
        return new { quest.Id, quest.IssueKey, quest.Title, quest.BoardId };
    }

    private async Task<Quest?> FindQuestByKeyAsync(string? issueKey, Guid userId, CancellationToken ct)
    {
        var key = (issueKey ?? "").Trim().ToUpperInvariant();
        if (key.Length == 0) throw new ArgumentException("Укажите ключ задачи, например KAN-12");
        var teamIds = (await TeamPermissionsAsync(userId, ct)).Keys.ToList();
        return await _db.Quests.AsNoTracking().FirstOrDefaultAsync(q => q.IssueKey.ToUpper() == key && teamIds.Contains(q.Board.TeamId), ct);
    }

    public async Task UnlinkIssueAsync(Guid objectId, Guid questId, Guid userId, CancellationToken ct)
    {
        await RequireObjectAsync(objectId, userId, BoardPermission.View, ct);
        await _access.EnsureQuestPermissionAsync(questId, userId, BoardPermission.Work, ct);
        var link = await _db.AssetQuestLinks.FirstOrDefaultAsync(l => l.ObjectId == objectId && l.QuestId == questId, ct)
            ?? throw new KeyNotFoundException("Связь не найдена");
        var now = DateTime.UtcNow;
        var issueKey = await _db.Quests.Where(q => q.Id == questId).Select(q => q.IssueKey).FirstAsync(ct);
        var objectKey = await _db.AssetObjects.Where(o => o.Id == objectId).Select(o => o.Key).FirstAsync(ct);
        _db.AssetQuestLinks.Remove(link);
        _db.AssetObjectChanges.Add(new AssetObjectChange { Id = Guid.NewGuid(), ObjectId = objectId, UserId = userId, Field = "issue", OldValue = issueKey, CreatedAt = now });
        _db.QuestChanges.Add(new QuestChange { Id = Guid.NewGuid(), QuestId = questId, UserId = userId, ChangeType = "updated", Field = "assets", OldValue = objectKey, CreatedAt = now });
        await _db.SaveChangesAsync(ct);
    }

    public async Task<object> GetQuestAssetsAsync(Guid questId, Guid userId, CancellationToken ct)
    {
        await _access.EnsureQuestPermissionAsync(questId, userId, BoardPermission.View, ct);
        var teamIds = (await TeamPermissionsAsync(userId, ct)).Keys.ToList();
        return await (from l in _db.AssetQuestLinks.AsNoTracking()
                      join o in _db.AssetObjects.AsNoTracking() on l.ObjectId equals o.Id
                      join s in _db.AssetSchemas.AsNoTracking() on o.SchemaId equals s.Id
                      join t in _db.AssetObjectTypes.AsNoTracking() on o.ObjectTypeId equals t.Id
                      where l.QuestId == questId && teamIds.Contains(s.TeamId)
                      orderby o.Label
                      select new { o.Id, o.Key, o.Label, TypeName = t.Name, TypeIcon = t.Icon, SchemaName = s.Name }).ToListAsync(ct);
    }

    // ---------- import / export ----------

    public async Task<object> ImportAsync(Guid typeId, Guid userId, string content, CancellationToken ct)
    {
        var (type, schema) = await RequireTypeAsync(typeId, userId, BoardPermission.Work, ct);
        var rows = AssetCsv.Read(content);
        if (rows.Count < 2) throw new ArgumentException("Файл должен содержать строку заголовков и хотя бы одну строку данных");
        var ctx = await LoadSchemaContextAsync(schema.Id, ct);
        var effective = EffectiveAttributes(type.Id, ctx.Types.Values, ctx.Attributes.Values);
        var header = rows[0].Select(h => h.Trim()).ToList();
        int Find(params string[] names) => header.FindIndex(h => names.Any(n => string.Equals(h, n, StringComparison.OrdinalIgnoreCase)));
        var keyColumn = Find("Key", "Ключ");
        var labelColumn = Find("Label", "Name", "Название", "Имя");
        if (labelColumn < 0) throw new ArgumentException("Нужна колонка «Название» (или Name/Label)");
        var attributeColumns = new Dictionary<int, AssetAttribute>();
        var unknown = new List<string>();
        for (var i = 0; i < header.Count; i++)
        {
            if (i == keyColumn || i == labelColumn || header[i].Length == 0) continue;
            var attribute = effective.FirstOrDefault(a => string.Equals(a.Name, header[i], StringComparison.OrdinalIgnoreCase));
            if (attribute == null) unknown.Add(header[i]); else attributeColumns[i] = attribute;
        }

        var existingByKey = await _db.AssetObjects.Where(o => o.SchemaId == schema.Id).ToDictionaryAsync(o => o.Key, StringComparer.OrdinalIgnoreCase, ct);
        var errors = new List<object>();
        var created = 0;
        var updated = 0;
        var now = DateTime.UtcNow;
        for (var r = 1; r < rows.Count; r++)
        {
            var row = rows[r];
            string Cell(int i) => i >= 0 && i < row.Count ? row[i].Trim() : "";
            try
            {
                var label = RequireName(Cell(labelColumn), "Название объекта");
                var raw = attributeColumns.ToDictionary(c => c.Value.Id, c => (string?)Cell(c.Key));
                var key = Cell(keyColumn);
                AssetObject obj;
                List<AssetAttributeValue> existingValues;
                if (key.Length > 0)
                {
                    if (!existingByKey.TryGetValue(key, out obj!)) throw new ArgumentException($"Объект {key} не найден");
                    if (obj.ObjectTypeId != type.Id) throw new ArgumentException($"Объект {key} относится к другому типу");
                    existingValues = await _db.AssetAttributeValues.Where(v => v.ObjectId == obj.Id).ToListAsync(ct);
                    foreach (var keepId in effective.Where(a => !raw.ContainsKey(a.Id)).Select(a => a.Id))
                    {
                        var kept = existingValues.FirstOrDefault(v => v.AttributeId == keepId);
                        if (kept != null) raw[keepId] = kept.ReferencedObjectId?.ToString() ?? kept.Value;
                    }
                }
                else
                {
                    obj = new AssetObject
                    {
                        Id = Guid.NewGuid(), SchemaId = schema.Id, ObjectTypeId = type.Id,
                        Key = $"{schema.Key}-{schema.NextObjectNumber++}", CreatedByUserId = userId, CreatedAt = now,
                    };
                    existingValues = new List<AssetAttributeValue>();
                }
                var normalized = await NormalizeValuesAsync(ctx, type.Id, raw, obj.Id, ct, existingValues);
                if (key.Length == 0)
                {
                    _db.AssetObjects.Add(obj);
                    _db.AssetObjectChanges.Add(new AssetObjectChange { Id = Guid.NewGuid(), ObjectId = obj.Id, UserId = userId, Field = "created", NewValue = label, CreatedAt = now });
                    created++;
                }
                else
                {
                    if (obj.Label != label) _db.AssetObjectChanges.Add(new AssetObjectChange { Id = Guid.NewGuid(), ObjectId = obj.Id, UserId = userId, Field = "label", OldValue = obj.Label, NewValue = label, CreatedAt = now });
                    _db.AssetAttributeValues.RemoveRange(existingValues);
                    updated++;
                }
                obj.Label = label;
                obj.UpdatedAt = now;
                foreach (var (attribute, value, refId) in normalized)
                    if (value != null || refId != null)
                        _db.AssetAttributeValues.Add(new AssetAttributeValue { Id = Guid.NewGuid(), ObjectId = obj.Id, AttributeId = attribute.Id, Value = value, ReferencedObjectId = refId });
            }
            catch (Exception ex) when (ex is ArgumentException or KeyNotFoundException or FormatException)
            {
                errors.Add(new { Row = r + 1, Message = ex.Message });
            }
        }

        if (errors.Count > 0)
        {
            _db.ChangeTracker.Clear();
            return new { Imported = false, Created = 0, Updated = 0, Errors = errors, UnknownColumns = unknown };
        }
        schema.UpdatedAt = now;
        await _db.SaveChangesAsync(ct);
        return new { Imported = true, Created = created, Updated = updated, Errors = errors, UnknownColumns = unknown };
    }

    public async Task<(string FileName, string Content)> ExportAsync(Guid typeId, Guid userId, CancellationToken ct)
    {
        var (type, schema) = await RequireTypeAsync(typeId, userId, BoardPermission.View, ct);
        var ctx = await LoadSchemaContextAsync(schema.Id, ct);
        var effective = EffectiveAttributes(type.Id, ctx.Types.Values, ctx.Attributes.Values);
        var objects = await _db.AssetObjects.AsNoTracking().Where(o => o.ObjectTypeId == typeId).OrderBy(o => o.Key).ToListAsync(ct);
        var ids = objects.Select(o => o.Id).ToList();
        var values = (await _db.AssetAttributeValues.AsNoTracking().Where(v => ids.Contains(v.ObjectId)).ToListAsync(ct)).ToLookup(v => v.ObjectId);
        var refIds = values.SelectMany(g => g).Where(v => v.ReferencedObjectId.HasValue).Select(v => v.ReferencedObjectId!.Value).Distinct().ToList();
        var refKeys = await _db.AssetObjects.AsNoTracking().Where(o => refIds.Contains(o.Id)).ToDictionaryAsync(o => o.Id, o => o.Key, ct);
        var userIds = values.SelectMany(g => g).Where(v => ctx.Attributes.GetValueOrDefault(v.AttributeId)?.Type == AssetAttributeType.User && Guid.TryParse(v.Value, out _))
            .Select(v => Guid.Parse(v.Value!)).Distinct().ToList();
        var emails = await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Email, ct);

        var rows = new List<List<string?>> { new[] { "Key", "Название" }.Concat(effective.Select(a => a.Name)).ToList<string?>() };
        foreach (var o in objects)
        {
            var row = new List<string?> { o.Key, o.Label };
            foreach (var a in effective)
            {
                var v = values[o.Id].FirstOrDefault(x => x.AttributeId == a.Id);
                row.Add(v == null ? "" : a.Type switch
                {
                    AssetAttributeType.Reference => v.ReferencedObjectId is Guid r ? refKeys.GetValueOrDefault(r) : "",
                    AssetAttributeType.User => Guid.TryParse(v.Value, out var u) ? emails.GetValueOrDefault(u) ?? v.Value : v.Value,
                    _ => v.Value,
                });
            }
            rows.Add(row);
        }
        return ($"{schema.Key}-{type.Name}.csv", AssetCsv.Write(rows));
    }

    // ---------- values ----------

    private sealed record SchemaContext(Guid SchemaId, Dictionary<Guid, AssetObjectType> Types, Dictionary<Guid, AssetAttribute> Attributes);

    private async Task<SchemaContext> LoadSchemaContextAsync(Guid schemaId, CancellationToken ct)
    {
        var types = await _db.AssetObjectTypes.AsNoTracking().Where(t => t.SchemaId == schemaId).ToDictionaryAsync(t => t.Id, ct);
        var typeIds = types.Keys.ToList();
        var attributes = await _db.AssetAttributes.AsNoTracking().Where(a => typeIds.Contains(a.ObjectTypeId)).ToDictionaryAsync(a => a.Id, ct);
        return new SchemaContext(schemaId, types, attributes);
    }

    private async Task<List<(AssetAttribute Attribute, string? Value, Guid? RefId)>> NormalizeValuesAsync(
        SchemaContext ctx, Guid typeId, Dictionary<Guid, string?> raw, Guid selfId, CancellationToken ct, List<AssetAttributeValue>? existing = null)
    {
        var result = new List<(AssetAttribute, string?, Guid?)>();
        foreach (var attribute in EffectiveAttributes(typeId, ctx.Types.Values, ctx.Attributes.Values))
        {
            string? input;
            if (raw.TryGetValue(attribute.Id, out var provided)) input = provided;
            else
            {
                var current = existing?.FirstOrDefault(v => v.AttributeId == attribute.Id);
                input = current?.ReferencedObjectId?.ToString() ?? current?.Value;
            }
            input = string.IsNullOrWhiteSpace(input) ? null : input.Trim();
            if (input == null)
            {
                if (attribute.Required) throw new ArgumentException($"«{attribute.Name}»: обязательное поле");
                result.Add((attribute, null, null));
                continue;
            }
            switch (attribute.Type)
            {
                case AssetAttributeType.Reference:
                    result.Add((attribute, null, await ResolveReferenceAsync(ctx, attribute, input, selfId, ct)));
                    break;
                case AssetAttributeType.User:
                    result.Add((attribute, (await ResolveUserAsync(attribute, input, ct)).ToString(), null));
                    break;
                default:
                    result.Add((attribute, NormalizeScalar(attribute, input), null));
                    break;
            }
        }
        return result;
    }

    /// <summary>Validates and canonicalizes non-reference values. Public for tests.</summary>
    public static string NormalizeScalar(AssetAttribute attribute, string input)
    {
        switch (attribute.Type)
        {
            case AssetAttributeType.Text:
                if (input.Length > 4000) throw new ArgumentException($"«{attribute.Name}»: не длиннее 4000 символов");
                return input;
            case AssetAttributeType.Number:
                if (!decimal.TryParse(input.Replace(" ", "").Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var number))
                    throw new ArgumentException($"«{attribute.Name}»: ожидается число");
                return number.ToString(CultureInfo.InvariantCulture);
            case AssetAttributeType.Date:
                if (!DateTime.TryParseExact(input, new[] { "yyyy-MM-dd", "dd.MM.yyyy", "yyyy-MM-ddTHH:mm:ss", "yyyy-MM-ddTHH:mm:ssZ" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                    throw new ArgumentException($"«{attribute.Name}»: ожидается дата ГГГГ-ММ-ДД");
                return date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            case AssetAttributeType.Boolean:
                var lower = input.ToLowerInvariant();
                if (lower is "true" or "1" or "да" or "yes") return "true";
                if (lower is "false" or "0" or "нет" or "no") return "false";
                throw new ArgumentException($"«{attribute.Name}»: ожидается да/нет");
            case AssetAttributeType.Select:
            case AssetAttributeType.Status:
                var option = ParseOptions(attribute.Options).FirstOrDefault(o => string.Equals(o, input, StringComparison.CurrentCultureIgnoreCase));
                return option ?? throw new ArgumentException($"«{attribute.Name}»: допустимые значения — {string.Join(", ", ParseOptions(attribute.Options))}");
            case AssetAttributeType.Url:
                if (!Uri.TryCreate(input, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
                    throw new ArgumentException($"«{attribute.Name}»: ожидается ссылка http(s)://");
                return uri.ToString();
            case AssetAttributeType.Email:
                if (!Regex.IsMatch(input, @"^[^@\s]+@[^@\s]+\.[^@\s]+$")) throw new ArgumentException($"«{attribute.Name}»: ожидается адрес почты");
                return input.ToLowerInvariant();
            default:
                throw new ArgumentException($"«{attribute.Name}»: неподдерживаемый тип");
        }
    }

    private async Task<Guid> ResolveReferenceAsync(SchemaContext ctx, AssetAttribute attribute, string input, Guid selfId, CancellationToken ct)
    {
        var allowedTypes = attribute.ReferenceTypeId.HasValue
            ? Descendants(attribute.ReferenceTypeId.Value, ctx.Types.Values).Append(attribute.ReferenceTypeId.Value).ToList()
            : ctx.Types.Keys.ToList();
        var candidates = _db.AssetObjects.AsNoTracking().Where(o => o.SchemaId == ctx.SchemaId && allowedTypes.Contains(o.ObjectTypeId));
        List<Guid> found;
        if (Guid.TryParse(input, out var id)) found = await candidates.Where(o => o.Id == id).Select(o => o.Id).ToListAsync(ct);
        else
        {
            var upper = input.ToUpperInvariant();
            found = await candidates.Where(o => o.Key == upper).Select(o => o.Id).ToListAsync(ct);
            if (found.Count == 0) found = await candidates.Where(o => o.Label.ToLower() == input.ToLower()).Select(o => o.Id).Take(2).ToListAsync(ct);
        }
        if (found.Count == 0) throw new ArgumentException($"«{attribute.Name}»: объект «{input}» не найден");
        if (found.Count > 1) throw new ArgumentException($"«{attribute.Name}»: несколько объектов «{input}», укажите ключ");
        if (found[0] == selfId) throw new ArgumentException($"«{attribute.Name}»: объект не может ссылаться сам на себя");
        return found[0];
    }

    private async Task<Guid> ResolveUserAsync(AssetAttribute attribute, string input, CancellationToken ct)
    {
        List<Guid> found;
        if (Guid.TryParse(input, out var id)) found = await _db.Users.AsNoTracking().Where(u => u.Id == id).Select(u => u.Id).ToListAsync(ct);
        else
        {
            var lower = input.ToLower();
            found = await _db.Users.AsNoTracking().Where(u => u.Email.ToLower() == lower).Select(u => u.Id).ToListAsync(ct);
            if (found.Count == 0) found = await _db.Users.AsNoTracking().Where(u => u.DisplayName.ToLower() == lower).Select(u => u.Id).Take(2).ToListAsync(ct);
        }
        if (found.Count == 0) throw new ArgumentException($"«{attribute.Name}»: пользователь «{input}» не найден");
        if (found.Count > 1) throw new ArgumentException($"«{attribute.Name}»: несколько пользователей «{input}», укажите email");
        return found[0];
    }

    private async Task<string?> DisplayAsync(SchemaContext ctx, AssetAttribute attribute, string? value, Guid? refId, CancellationToken ct)
    {
        if (attribute.Type == AssetAttributeType.Reference)
            return refId is Guid r ? await _db.AssetObjects.AsNoTracking().Where(o => o.Id == r).Select(o => o.Label + " (" + o.Key + ")").FirstOrDefaultAsync(ct) : null;
        if (attribute.Type == AssetAttributeType.User && Guid.TryParse(value, out var u))
            return await _db.Users.AsNoTracking().Where(x => x.Id == u).Select(x => x.DisplayName).FirstOrDefaultAsync(ct) ?? value;
        return value;
    }

    // ---------- helpers ----------

    /// <summary>Attributes of the type including those inherited from its ancestors, root first.</summary>
    public static List<AssetAttribute> EffectiveAttributes(Guid typeId, IEnumerable<AssetObjectType> types, IEnumerable<AssetAttribute> attributes)
    {
        var typeMap = types.ToDictionary(t => t.Id);
        var path = TypePath(typeId, typeMap);
        var byType = attributes.ToLookup(a => a.ObjectTypeId);
        return path.SelectMany(t => byType[t.Id].OrderBy(a => a.Position)).ToList();
    }

    public static List<AssetObjectType> TypePath(Guid typeId, IReadOnlyDictionary<Guid, AssetObjectType> types)
    {
        var path = new List<AssetObjectType>();
        var seen = new HashSet<Guid>();
        for (Guid? cursor = typeId; cursor.HasValue && types.TryGetValue(cursor.Value, out var t) && seen.Add(t.Id); cursor = t.ParentTypeId)
            path.Insert(0, t);
        return path;
    }

    public static IEnumerable<Guid> Descendants(Guid typeId, IEnumerable<AssetObjectType> types)
    {
        var children = types.ToLookup(t => t.ParentTypeId);
        var stack = new Stack<Guid>(children[typeId].Select(t => t.Id));
        var seen = new HashSet<Guid>();
        while (stack.Count > 0)
        {
            var id = stack.Pop();
            if (!seen.Add(id)) continue;
            yield return id;
            foreach (var c in children[id]) stack.Push(c.Id);
        }
    }

    private static object AttributeDto(AssetAttribute a) => new
    {
        a.Id, a.ObjectTypeId, a.Name, a.Type, a.Required, a.ReferenceTypeId, a.Position,
        Options = ParseOptions(a.Options),
    };

    public static List<string> ParseOptions(string? options) =>
        (options ?? "").Split(new[] { '\n', '\r', ',' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.CurrentCultureIgnoreCase).Take(50).ToList();

    private static bool IsReservedName(string name) =>
        new[] { "key", "label", "name", "objectType", "objectTypeAndChildren", "schema", "schemaKey", "created", "updated", "linkedIssues", "objectId" }
            .Contains(name, StringComparer.OrdinalIgnoreCase);

    private static string RequireName(string? value, string field)
    {
        var trimmed = (value ?? "").Trim();
        if (trimmed.Length == 0) throw new ArgumentException($"{field}: обязательное поле");
        if (trimmed.Length > 200) throw new ArgumentException($"{field}: не длиннее 200 символов");
        return trimmed;
    }

    private static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
