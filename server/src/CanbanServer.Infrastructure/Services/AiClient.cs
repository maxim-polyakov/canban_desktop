using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

public sealed record AiMessage(string Role, string Content);

/// <summary>Minimal client for any OpenAI-compatible chat completions API (OpenAI, vLLM, Ollama, proxies).</summary>
public sealed class AiClient
{
    public const string HttpClientName = "ai";
    private const string DefaultBaseUrl = "https://api.openai.com/v1";
    private readonly IHttpClientFactory _http;
    private readonly ILogger<AiClient> _logger;
    private readonly string _baseUrl;
    private readonly string? _apiKey;
    private readonly string? _model;

    public AiClient(IHttpClientFactory http, IConfiguration config, ILogger<AiClient> logger)
    {
        _http = http;
        _logger = logger;
        var baseUrl = config["Ai:BaseUrl"];
        _baseUrl = (string.IsNullOrWhiteSpace(baseUrl) ? DefaultBaseUrl : baseUrl.Trim()).TrimEnd('/');
        _apiKey = string.IsNullOrWhiteSpace(config["Ai:ApiKey"]) ? null : config["Ai:ApiKey"]!.Trim();
        _model = string.IsNullOrWhiteSpace(config["Ai:Model"]) ? null : config["Ai:Model"]!.Trim();
        IsEnabled = _model != null && (_apiKey != null || !string.IsNullOrWhiteSpace(baseUrl));
    }

    /// <summary>A model is configured; local servers such as Ollama may run without an API key.</summary>
    public bool IsEnabled { get; }

    public async Task<string> CompleteAsync(IReadOnlyList<AiMessage> messages, int maxTokens, bool json, CancellationToken ct)
    {
        if (!IsEnabled) throw new InvalidOperationException("ИИ не настроен: администратор должен указать Ai__Model и Ai__ApiKey.");
        using var request = new HttpRequestMessage(HttpMethod.Post, _baseUrl + "/chat/completions")
        {
            Content = JsonContent.Create(new ChatRequest(
                _model!,
                messages.Select(m => new ChatMessage(m.Role, m.Content)).ToList(),
                0.2,
                maxTokens,
                json ? new ResponseFormat("json_object") : null)),
        };
        if (_apiKey != null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);

        HttpResponseMessage response;
        try
        {
            response = await _http.CreateClient(HttpClientName).SendAsync(request, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            _logger.LogWarning("AI request failed: {Error}", ex.GetType().Name);
            throw new InvalidOperationException("ИИ-сервис не ответил. Попробуйте ещё раз.");
        }
        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("AI request returned {Status}", (int)response.StatusCode);
                throw new InvalidOperationException((int)response.StatusCode switch
                {
                    401 or 403 => "ИИ-сервис отклонил ключ доступа.",
                    429 => "ИИ-сервис перегружен или исчерпан лимит. Попробуйте позже.",
                    _ => $"ИИ-сервис вернул ошибку {(int)response.StatusCode}.",
                });
            }
            var body = await response.Content.ReadFromJsonAsync<ChatResponse>(cancellationToken: ct);
            var text = body?.Choices?.FirstOrDefault()?.Message?.Content?.Trim();
            if (string.IsNullOrEmpty(text)) throw new InvalidOperationException("ИИ-сервис вернул пустой ответ.");
            return text;
        }
    }

    private sealed record ChatRequest(
        [property: JsonPropertyName("model")] string Model,
        [property: JsonPropertyName("messages")] List<ChatMessage> Messages,
        [property: JsonPropertyName("temperature")] double Temperature,
        [property: JsonPropertyName("max_tokens")] int MaxTokens,
        [property: JsonPropertyName("response_format"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ResponseFormat? ResponseFormat);

    private sealed record ChatMessage(
        [property: JsonPropertyName("role")] string Role,
        [property: JsonPropertyName("content")] string? Content);

    private sealed record ResponseFormat([property: JsonPropertyName("type")] string Type);

    private sealed record ChatResponse([property: JsonPropertyName("choices")] List<ChatChoice>? Choices);

    private sealed record ChatChoice([property: JsonPropertyName("message")] ChatMessage? Message);
}
