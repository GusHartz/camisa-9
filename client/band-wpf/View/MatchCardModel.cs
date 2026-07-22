using System.Globalization;
using System.Linq;
using BandClient.Api;

namespace BandClient.View;

/// <summary>O resultado da partida do ponto de vista do MEU clube — dirige a cor do card (SPEC-049).</summary>
public enum MatchResultKind
{
    Win,
    Draw,
    Loss,
}

/// <summary>Um chip de gol do card — minuto + rótulo (VOCÊ/nome do artilheiro) + assistência opcional.
/// Os *IsGold marcam o destaque OURO — só quando é o SEU gol/assistência (a raridade visual do design:
/// ouro = glória, nunca UI comum).</summary>
public sealed record CardGoalChip(
    int Minute,
    string Label,
    bool LabelIsGold,
    string? Assist,
    bool AssistIsGold
);

/// <summary>O modelo do card de partida (SPEC-049) — só o dado que o servidor já computou, projetado
/// para render. Thin renderer (OP-17): nenhuma regra de jogo — o resultado V/E/D é o SINAL do placar;
/// os nomes/nota vêm prontos do `/v1/band` (SPEC-046). Só há card quando há jogo publicado COM nota.</summary>
public sealed record MatchCardModel(
    string PlayerName,
    string PositionLabel,
    int ShirtNumber,
    string ClubName,
    bool IsHome,
    string OpponentName,
    int GoalsFor,
    int GoalsAgainst,
    MatchResultKind Result,
    double Rating,
    IReadOnlyList<CardGoalChip> Chips,
    int SeasonNumber,
    int Round
)
{
    /// <summary>Projeta o card do estado atual; `null` se não há jogo publicado com nota (o gate do
    /// affordance de compartilhar). Tolerante: null-guarda tudo — um payload torto não gera card e não
    /// quebra a faixa.</summary>
    public static MatchCardModel? From(BandState? s)
    {
        BandAthlete? a = s?.Athlete;
        BandClub? c = s?.Club;
        BandMatch? m = c?.TodayMatch;
        if (a is null || c is null || m is null)
            return null;
        if (
            !m.Played
            || m.MyRating is not { } rating
            || m.GoalsFor is not { } gf
            || m.GoalsAgainst is not { } ga
        )
            return null;

        MatchResultKind result =
            gf > ga ? MatchResultKind.Win
            : gf == ga ? MatchResultKind.Draw
            : MatchResultKind.Loss;

        // Só os gols do MEU clube viram chips (a faixa tem os nomes só do próprio elenco). Filtra null
        // (JSON hostil) — o mesmo rigor do ViewModel; senão uma lista com um null aborta o Select.
        List<CardGoalChip> chips = (m.Goals ?? Array.Empty<BandGoal>())
            .Where(g => g is not null && g.IsMine)
            .Select(ChipOf)
            .ToList();

        return new MatchCardModel(
            Up(a.Name),
            MapPosition(a.Position),
            a.Number,
            Up(c.Name),
            m.IsHome,
            Up(m.OpponentName),
            gf,
            ga,
            result,
            rating,
            chips,
            ParseSeason(c.SeasonId),
            c.Round ?? 0
        );
    }

    // O artilheiro do meu clube em UPPERCASE (o design mostra "C. FONTOURA"); "VOCÊ" quando é meu gol.
    // A assistência preserva a caixa (Segoe UI, "assist. L. Dias"); "assist. você" quando é minha.
    private static CardGoalChip ChipOf(BandGoal g)
    {
        string label = g.ByMe
            ? "VOCÊ"
            : string.IsNullOrWhiteSpace(g.Scorer)
                ? "GOL"
                : Up(g.Scorer);
        string? assist = g.AssistByMe
            ? "assist. você"
            : string.IsNullOrWhiteSpace(g.Assist)
                ? null
                : $"assist. {g.Assist}";
        return new CardGoalChip(g.Minute, label, g.ByMe, assist, g.AssistByMe);
    }

    private static string MapPosition(string? pos) =>
        (pos ?? "").ToUpperInvariant() switch
        {
            "GK" => "GOL",
            "DEF" => "ZAG",
            "MID" => "MEI",
            "FWD" => "ATA",
            { Length: >= 3 } p => p[..3],
            var p => p,
        };

    // A temporada do card é um número legível ("TEMPORADA 1") — extrai os dígitos do seasonId (que pode
    // vir "s1"/"1"/etc.); 0 se não houver dígito (o render mostra o que veio, não inventa).
    private static int ParseSeason(string? seasonId)
    {
        string digits = new((seasonId ?? "").Where(char.IsDigit).ToArray());
        return int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out int n)
            ? n
            : 0;
    }

    private static string Up(string? s) => (s ?? "").ToUpperInvariant();
}
