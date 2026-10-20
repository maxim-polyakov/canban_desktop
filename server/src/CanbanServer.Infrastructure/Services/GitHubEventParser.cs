using System.Text.Json;
using System.Text.RegularExpressions;

namespace CanbanServer.Infrastructure.Services;

public sealed record GitHubDevelopmentEvent(string Kind, string ExternalId, string Url, string Title, string? Status, IReadOnlyList<string> IssueKeys,
    string? AuthorEmail = null, string? Message = null);

/// <summary>A Jira-style smart commit command: "#comment text", "#time 1h 30m note" or a transition such as "#done".</summary>
public sealed record SmartCommitCommand(string Name, string Arguments);

public static class GitHubEventParser
{
    public const string BranchKind = "branch";
    public const string CommitKind = "commit";
    public const string PullRequestKind = "pull_request";
    public const string CheckRunKind = "check_run";

    private static readonly Regex IssueKeyPattern = new(@"(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]+-\d+)(?![0-9])", RegexOptions.Compiled);

    public static IReadOnlyList<string> ExtractIssueKeys(params string?[] texts) =>
        texts.Where(t => !string.IsNullOrWhiteSpace(t))
            .SelectMany(t => IssueKeyPattern.Matches(t!).Select(m => m.Groups[1].Value.ToUpperInvariant()))
            .Distinct()
            .ToList();

    public static string? RepositoryFullName(JsonElement root) =>
        root.TryGetProperty("repository", out var repo) && repo.TryGetProperty("full_name", out var name) ? name.GetString() : null;

    public static long? InstallationId(JsonElement root) =>
        root.TryGetProperty("installation", out var installation) && installation.TryGetProperty("id", out var id) && id.TryGetInt64(out var value)
            ? value
            : null;

    public static List<GitHubDevelopmentEvent> Parse(string eventName, JsonElement root)
    {
        var result = new List<GitHubDevelopmentEvent>();
        var repoUrl = root.TryGetProperty("repository", out var repo) && repo.TryGetProperty("html_url", out var html) ? html.GetString() ?? "" : "";
        switch (eventName)
        {
            case "pull_request":
                if (root.TryGetProperty("pull_request", out var pr))
                {
                    var title = Str(pr, "title");
                    var headRef = pr.TryGetProperty("head", out var head) ? Str(head, "ref") : null;
                    var merged = pr.TryGetProperty("merged", out var m) && m.ValueKind == JsonValueKind.True;
                    var number = pr.TryGetProperty("number", out var n) ? n.ToString() : "";
                    result.Add(new GitHubDevelopmentEvent(PullRequestKind, pr.GetProperty("id").ToString(), Str(pr, "html_url") ?? repoUrl,
                        $"#{number} {title}".Trim(), merged ? "merged" : Str(pr, "state"), ExtractIssueKeys(title, headRef)));
                    if (!string.IsNullOrWhiteSpace(headRef))
                        result.Add(Branch(repoUrl, headRef!, null));
                }
                break;
            case "push":
                var branch = Str(root, "ref") is { } fullRef && fullRef.StartsWith("refs/heads/", StringComparison.Ordinal) ? fullRef["refs/heads/".Length..] : null;
                var deleted = root.TryGetProperty("deleted", out var d) && d.ValueKind == JsonValueKind.True;
                if (branch != null) result.Add(Branch(repoUrl, branch, deleted ? "deleted" : null));
                if (root.TryGetProperty("commits", out var commits) && commits.ValueKind == JsonValueKind.Array)
                {
                    foreach (var commit in commits.EnumerateArray())
                    {
                        var message = Str(commit, "message") ?? "";
                        var firstLine = message.Split('\n', 2)[0].Trim();
                        var email = commit.TryGetProperty("author", out var author) ? Str(author, "email") : null;
                        result.Add(new GitHubDevelopmentEvent(CommitKind, Str(commit, "id") ?? Guid.NewGuid().ToString("N"), Str(commit, "url") ?? repoUrl,
                            firstLine, null, ExtractIssueKeys(message, branch), email, message));
                    }
                }
                break;
            case "create":
                if (Str(root, "ref_type") == "branch" && Str(root, "ref") is { } created)
                    result.Add(Branch(repoUrl, created, null));
                break;
            case "delete":
                if (Str(root, "ref_type") == "branch" && Str(root, "ref") is { } removed)
                    result.Add(Branch(repoUrl, removed, "deleted"));
                break;
            case "check_run":
                if (root.TryGetProperty("check_run", out var check))
                {
                    var headBranch = check.TryGetProperty("check_suite", out var suite) ? Str(suite, "head_branch") : null;
                    var name = Str(check, "name") ?? "check";
                    result.Add(new GitHubDevelopmentEvent(CheckRunKind, check.GetProperty("id").ToString(), Str(check, "html_url") ?? repoUrl,
                        name, Str(check, "conclusion") ?? Str(check, "status"), ExtractIssueKeys(headBranch, name)));
                }
                break;
        }
        return result.Where(e => e.IssueKeys.Count > 0).ToList();
    }

    private static readonly Regex SmartCommandPattern = new(@"(?<![\w#])#(\p{L}[\w-]*)", RegexOptions.Compiled);
    private static readonly Regex DurationPart = new(@"^(\d+(?:[.,]\d+)?)([wdhm])$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>Commands only count in messages that mention an issue key; arguments run to the next command or line end.</summary>
    public static IReadOnlyList<SmartCommitCommand> ParseSmartCommands(string? message)
    {
        var result = new List<SmartCommitCommand>();
        if (string.IsNullOrWhiteSpace(message)) return result;
        foreach (var line in message.Split('\n'))
        {
            if (ExtractIssueKeys(line).Count == 0) continue;
            var matches = SmartCommandPattern.Matches(line);
            for (var i = 0; i < matches.Count; i++)
            {
                var start = matches[i].Index + matches[i].Length;
                var end = i + 1 < matches.Count ? matches[i + 1].Index : line.Length;
                result.Add(new SmartCommitCommand(matches[i].Groups[1].Value.ToLowerInvariant(), line[start..end].Trim()));
            }
        }
        return result;
    }

    /// <summary>Parses the leading Jira duration of "#time" ("1w 2d 4h 30m", 1w = 5d, 1d = 8h) and returns the rest as the note.</summary>
    public static (int Minutes, string Note) ParseDuration(string arguments)
    {
        var minutes = 0.0;
        var words = arguments.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var used = 0;
        foreach (var word in words)
        {
            var match = DurationPart.Match(word);
            if (!match.Success) break;
            var value = double.Parse(match.Groups[1].Value.Replace(',', '.'), System.Globalization.CultureInfo.InvariantCulture);
            minutes += value * char.ToLowerInvariant(match.Groups[2].Value[0]) switch { 'w' => 5 * 8 * 60, 'd' => 8 * 60, 'h' => 60, _ => 1 };
            used++;
        }
        return ((int)Math.Round(minutes), string.Join(' ', words.Skip(used)));
    }

    private static GitHubDevelopmentEvent Branch(string repoUrl, string name, string? status) =>
        new(BranchKind, name, string.IsNullOrEmpty(repoUrl) ? "" : $"{repoUrl}/tree/{Uri.EscapeDataString(name).Replace("%2F", "/")}", name, status, ExtractIssueKeys(name));

    private static string? Str(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
