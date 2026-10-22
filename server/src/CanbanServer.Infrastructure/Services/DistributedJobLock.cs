using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;

namespace CanbanServer.Infrastructure.Services;

/// <summary>
/// Prevents periodic jobs from running concurrently when the API has multiple replicas.
/// Transaction advisory locks also work correctly through transaction-pooled PostgreSQL endpoints.
/// </summary>
internal static class DistributedJobLock
{
    public static async Task<bool> TryRunAsync(
        IServiceScopeFactory scopes,
        string jobName,
        Func<CancellationToken, Task> action,
        CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CanbanDbContext>();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var connection = db.Database.GetDbConnection();
        var key = LockKey(jobName);

        await using var acquire = connection.CreateCommand();
        acquire.Transaction = transaction.GetDbTransaction();
        acquire.CommandText = "SELECT pg_try_advisory_xact_lock(@key)";
        AddKey(acquire, key);
        var acquired = (bool?)await acquire.ExecuteScalarAsync(ct) == true;
        if (!acquired)
        {
            await transaction.RollbackAsync(ct);
            return false;
        }

        await action(ct);
        await transaction.CommitAsync(ct);
        return true;
    }

    internal static long LockKey(string jobName)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes("canban-background-job:" + jobName));
        return BinaryPrimitives.ReadInt64LittleEndian(hash);
    }

    private static void AddKey(System.Data.Common.DbCommand command, long key)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = "key";
        parameter.Value = key;
        command.Parameters.Add(parameter);
    }
}
