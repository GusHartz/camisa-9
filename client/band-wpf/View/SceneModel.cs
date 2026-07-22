using BandClient.Api;

namespace BandClient.View;

/// <summary>A fase do dia que escolhe a pintura (os valores canônicos do servidor).</summary>
internal enum ScenePhase
{
    Ct,
    Casa,
    Vespera,
}

/// <summary>
/// A CHAVE de uma cena (SPEC-052): tudo que muda o desenho, e nada além disso. É o que permite
/// compor o cenário UMA vez e reusá-lo — o poll de 60s e os ~2 eventos/s do replay não mexem em
/// nenhum destes campos, então não repintam nada.
///
/// Sendo um record, a igualdade estrutural é o próprio teste de cache.
/// </summary>
internal sealed record SceneKey(
    ScenePhase Phase,
    bool Penthouse,
    bool Played,
    int GoalsFor,
    int GoalsAgainst,
    int ShirtNumber,
    double HeightDip
);

/// <summary>
/// Projeta o <see cref="BandState"/> na chave de cena. Thin renderer (OP-17): aqui não se decide
/// regra nenhuma — só se lê o que o servidor mandou, com null-guard em tudo (a faixa nunca pode
/// ficar sem fundo por causa de um campo ausente).
/// </summary>
internal static class SceneModel
{
    /// O degrau da escada da casa que troca a pintura. ⚠️ Mapa PROVISÓRIO (decisão do founder,
    /// SPEC-052): o jogo tem 4 degraus e o handoff entregou 2 cenas — `0-1` mostram a pensão,
    /// `2-3` a cobertura. Some quando a arte da quitinete e do apê chegar.
    private const int PenthouseFromTier = 2;

    internal static SceneKey From(BandState? state, double heightDip)
    {
        BandMatch? match = state?.Club?.TodayMatch;
        bool played = match?.Played == true;
        return new SceneKey(
            PhaseOf(state?.Phase),
            (state?.Home?.LifestyleTier ?? 0) >= PenthouseFromTier,
            played,
            played ? match?.GoalsFor ?? 0 : 0,
            played ? match?.GoalsAgainst ?? 0 : 0,
            state?.Athlete?.Number ?? 0,
            heightDip
        );
    }

    /// Fase desconhecida (ou ausente) cai na casa — a cena neutra. A faixa nunca fica sem fundo.
    private static ScenePhase PhaseOf(string? phase) =>
        (phase ?? "").ToLowerInvariant() switch
        {
            "ct" => ScenePhase.Ct,
            "vespera" => ScenePhase.Vespera,
            _ => ScenePhase.Casa,
        };
}
