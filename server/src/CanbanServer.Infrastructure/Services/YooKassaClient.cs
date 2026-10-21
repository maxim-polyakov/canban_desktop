using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

public record YooKassaPayment(string Id, string Status, bool Paid, string? ConfirmationUrl, string? PaymentMethodId, bool PaymentMethodSaved,
    string? PaymentMethodTitle, string? CancellationReason, decimal Amount);

public record YooKassaPaymentRequest(decimal Amount, string Description, string IdempotenceKey, IReadOnlyDictionary<string, string> Metadata,
    string? ReturnUrl, string? PaymentMethodId, bool SavePaymentMethod, string? CustomerEmail);

/// <summary>YooKassa API v3. Configured by Billing:YooKassa:ShopId and Billing:YooKassa:SecretKey.</summary>
public class YooKassaClient
{
    public const string HttpClientName = "yookassa";
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _config;
    private readonly ILogger<YooKassaClient> _logger;

    public YooKassaClient(IHttpClientFactory http, IConfiguration config, ILogger<YooKassaClient> logger)
    {
        _http = http;
        _config = config;
        _logger = logger;
    }

    private string? ShopId => _config["Billing:YooKassa:ShopId"]?.Trim();
    private string? SecretKey => _config["Billing:YooKassa:SecretKey"]?.Trim();
    private string BaseUrl => (_config["Billing:YooKassa:BaseUrl"] ?? "https://api.yookassa.ru/v3").TrimEnd('/');

    public bool IsEnabled => !string.IsNullOrEmpty(ShopId) && !string.IsNullOrEmpty(SecretKey);
    /// <summary>Saving cards for renewals has to be enabled for the shop by YooKassa first.</summary>
    public bool RecurringEnabled => IsEnabled && string.Equals(_config["Billing:YooKassa:Recurring"], "true", StringComparison.OrdinalIgnoreCase);
    /// <summary>54-FZ receipts; turn on when fiscalization is set up in the shop.</summary>
    private bool SendReceipt => string.Equals(_config["Billing:YooKassa:SendReceipt"], "true", StringComparison.OrdinalIgnoreCase);
    private int VatCode => int.TryParse(_config["Billing:YooKassa:VatCode"], out var code) ? code : 1;

    public async Task<YooKassaPayment> CreatePaymentAsync(YooKassaPaymentRequest request, CancellationToken ct)
    {
        var value = Money(request.Amount);
        var body = new JsonObject
        {
            ["amount"] = new JsonObject { ["value"] = value, ["currency"] = "RUB" },
            ["capture"] = true,
            ["description"] = request.Description.Length > 128 ? request.Description[..128] : request.Description,
            ["metadata"] = new JsonObject(request.Metadata.Select(kv => KeyValuePair.Create(kv.Key, (JsonNode?)kv.Value))),
        };
        if (request.PaymentMethodId != null) body["payment_method_id"] = request.PaymentMethodId;
        else body["confirmation"] = new JsonObject { ["type"] = "redirect", ["return_url"] = request.ReturnUrl };
        if (request.SavePaymentMethod) body["save_payment_method"] = true;
        if (SendReceipt && !string.IsNullOrEmpty(request.CustomerEmail))
        {
            body["receipt"] = new JsonObject
            {
                ["customer"] = new JsonObject { ["email"] = request.CustomerEmail },
                ["items"] = new JsonArray(new JsonObject
                {
                    ["description"] = request.Description.Length > 128 ? request.Description[..128] : request.Description,
                    ["quantity"] = "1.00",
                    ["amount"] = new JsonObject { ["value"] = value, ["currency"] = "RUB" },
                    ["vat_code"] = VatCode,
                    ["payment_subject"] = "service",
                    ["payment_mode"] = "full_payment",
                }),
            };
        }

        using var message = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/payments")
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
        };
        message.Headers.Add("Idempotence-Key", request.IdempotenceKey);
        return await SendAsync(message, ct);
    }

    public Task<YooKassaPayment> GetPaymentAsync(string id, CancellationToken ct) =>
        SendAsync(new HttpRequestMessage(HttpMethod.Get, $"{BaseUrl}/payments/{Uri.EscapeDataString(id)}"), ct);

    private async Task<YooKassaPayment> SendAsync(HttpRequestMessage message, CancellationToken ct)
    {
        if (!IsEnabled) throw new InvalidOperationException("Онлайн-оплата пока не подключена.");
        message.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{ShopId}:{SecretKey}")));
        using (message)
        {
            HttpResponseMessage response;
            try { response = await _http.CreateClient(HttpClientName).SendAsync(message, ct); }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
            {
                _logger.LogWarning("YooKassa request failed: {Error}", ex.GetType().Name);
                throw new InvalidOperationException("Платёжный сервис не ответил. Попробуйте ещё раз.");
            }
            using (response)
            {
                var text = await response.Content.ReadAsStringAsync(ct);
                if (!response.IsSuccessStatusCode)
                {
                    var description = TryRead(text, "description");
                    _logger.LogWarning("YooKassa returned {Status}: {Code}", (int)response.StatusCode, TryRead(text, "code"));
                    throw new InvalidOperationException((int)response.StatusCode == 401
                        ? "Платёжный сервис отклонил ключи магазина."
                        : $"Платёжный сервис отклонил запрос{(string.IsNullOrEmpty(description) ? "" : ": " + description)}");
                }
                return Parse(text);
            }
        }
    }

    public static YooKassaPayment Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        string? Str(JsonElement e, params string[] path)
        {
            foreach (var p in path)
            {
                if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(p, out e)) return null;
            }
            return e.ValueKind == JsonValueKind.String ? e.GetString() : null;
        }
        bool Bool(JsonElement e, params string[] path)
        {
            foreach (var p in path)
            {
                if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(p, out e)) return false;
            }
            return e.ValueKind == JsonValueKind.True;
        }
        var amount = decimal.TryParse(Str(root, "amount", "value"), NumberStyles.Number, CultureInfo.InvariantCulture, out var a) ? a : 0;
        return new YooKassaPayment(
            Str(root, "id") ?? throw new InvalidOperationException("Платёжный сервис вернул неполный ответ."),
            Str(root, "status") ?? "pending",
            Bool(root, "paid"),
            Str(root, "confirmation", "confirmation_url"),
            Str(root, "payment_method", "id"),
            Bool(root, "payment_method", "saved"),
            Str(root, "payment_method", "title"),
            Str(root, "cancellation_details", "reason"),
            amount);
    }

    private static string Money(decimal amount) => Math.Round(amount, 2).ToString("0.00", CultureInfo.InvariantCulture);

    private static string? TryRead(string json, string property)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty(property, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        }
        catch (JsonException) { return null; }
    }
}
