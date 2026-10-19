using CanbanServer.Application.Contracts;

namespace CanbanServer.Infrastructure.Services;

public sealed class JqlParser
{
    private readonly List<Token> _tokens;
    private int _position;

    public JqlParser(string input) => _tokens = Lex(input).ToList();

    public JqlQuery Parse()
    {
        JqlNode? where = Is("ORDER") || Is(TokenKind.End) ? null : ParseOr();
        var order = new List<JqlOrder>();
        if (Take("ORDER"))
        {
            Need("BY");
            do
            {
                var field = NeedValue();
                var descending = Take("DESC");
                if (!descending) Take("ASC");
                order.Add(new JqlOrder(field, descending));
            } while (Take(TokenKind.Comma));
        }
        Need(TokenKind.End);
        return new JqlQuery(where, order);
    }

    private JqlNode ParseOr()
    {
        var node = ParseAnd();
        while (Take("OR")) node = new JqlBinary("OR", node, ParseAnd());
        return node;
    }

    private JqlNode ParseAnd()
    {
        var node = ParseUnary();
        while (Take("AND")) node = new JqlBinary("AND", node, ParseUnary());
        return node;
    }

    private JqlNode ParseUnary()
    {
        if (Take("NOT")) return new JqlNot(ParseUnary());
        if (Take(TokenKind.LeftParen))
        {
            var node = ParseOr();
            Need(TokenKind.RightParen);
            return node;
        }
        return ParsePredicate();
    }

    private JqlNode ParsePredicate()
    {
        var field = NeedValue();
        string op;
        if (Take("IS"))
        {
            op = Take("NOT") ? "IS NOT EMPTY" : "IS EMPTY";
            Need("EMPTY");
            return new JqlPredicate(field, op, Array.Empty<JqlValue>());
        }
        if (Take("NOT"))
        {
            Need("IN");
            op = "NOT IN";
        }
        else if (Take("IN")) op = "IN";
        else op = Need(TokenKind.Operator).Text.ToUpperInvariant();

        var values = new List<JqlValue>();
        if (op is "IN" or "NOT IN")
        {
            Need(TokenKind.LeftParen);
            do { values.Add(ParseValue()); } while (Take(TokenKind.Comma));
            Need(TokenKind.RightParen);
        }
        else values.Add(ParseValue());
        return new JqlPredicate(field, op, values);
    }

    private JqlValue ParseValue()
    {
        var token = NeedAny(TokenKind.Word, TokenKind.String, TokenKind.Number);
        if (Take(TokenKind.LeftParen))
        {
            Need(TokenKind.RightParen);
            return new JqlValue(token.Text, true);
        }
        return new JqlValue(token.Text);
    }

    private bool Is(string text) => Current.Text.Equals(text, StringComparison.OrdinalIgnoreCase);
    private bool Is(TokenKind kind) => Current.Kind == kind;
    private bool Take(string text) { if (!Is(text)) return false; _position++; return true; }
    private bool Take(TokenKind kind) { if (!Is(kind)) return false; _position++; return true; }
    private Token Need(string text) => Take(text) ? _tokens[_position - 1] : throw Error($"Expected {text}");
    private Token Need(TokenKind kind) => Take(kind) ? _tokens[_position - 1] : throw Error($"Expected {kind}");
    private string NeedValue() => NeedAny(TokenKind.Word, TokenKind.String).Text;
    private Token NeedAny(params TokenKind[] kinds)
    {
        if (kinds.Contains(Current.Kind)) return _tokens[_position++];
        throw Error("Expected value");
    }
    private Token Current => _tokens[_position];
    private FormatException Error(string message) => new($"{message} at position {Current.Position}");

    private static IEnumerable<Token> Lex(string input)
    {
        for (var i = 0; i < input.Length;)
        {
            if (char.IsWhiteSpace(input[i])) { i++; continue; }
            var start = i;
            var c = input[i];
            if (c == '(') { i++; yield return new(TokenKind.LeftParen, "(", start); continue; }
            if (c == ')') { i++; yield return new(TokenKind.RightParen, ")", start); continue; }
            if (c == ',') { i++; yield return new(TokenKind.Comma, ",", start); continue; }
            if ("=!<>~".Contains(c))
            {
                i++;
                if (i < input.Length && (input[i] == '=' || (c == '!' && input[i] == '~'))) i++;
                var op = input[start..i];
                if (op is not ("=" or "!=" or ">" or ">=" or "<" or "<=" or "~" or "!~"))
                    throw new FormatException($"Invalid operator at position {start}");
                yield return new(TokenKind.Operator, op, start);
                continue;
            }
            if (c is '"' or '\'')
            {
                var quote = c; i++;
                var value = new System.Text.StringBuilder();
                while (i < input.Length && input[i] != quote)
                {
                    if (input[i] == '\\' && i + 1 < input.Length) i++;
                    value.Append(input[i++]);
                }
                if (i == input.Length) throw new FormatException($"Unterminated string at position {start}");
                i++;
                yield return new(TokenKind.String, value.ToString(), start);
                continue;
            }
            while (i < input.Length && !char.IsWhiteSpace(input[i]) && !"(),=!<>~".Contains(input[i])) i++;
            if (i == start) throw new FormatException($"Unexpected character at position {start}");
            var text = input[start..i];
            yield return new(text.All(ch => char.IsDigit(ch) || ch is '-' or ':' or '.') ? TokenKind.Number : TokenKind.Word, text, start);
        }
        yield return new(TokenKind.End, "", input.Length);
    }

    private record Token(TokenKind Kind, string Text, int Position);
    private enum TokenKind { Word, String, Number, Operator, LeftParen, RightParen, Comma, End }
}
