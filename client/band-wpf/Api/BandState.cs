namespace BandClient.Api;

// Espelho C# do contrato `BandState` (SPEC-038, services/api/src/band/types.ts). Desserializado com
// System.Text.Json (PropertyNameCaseInsensitive → `forma` casa `Forma`). TOLERANTE por construção:
// campos JSON desconhecidos são ignorados (política aditiva-only do /v1); tipos anuláveis absorvem
// `null` = "não se aplica". Records = imutáveis; o cliente só LÊ (thin renderer, OP-17).

public sealed record BandTime(long EpochMs, int DayIndex, int BrtHour, int BrtMinute, bool RoundSettled);

public sealed record BandAppearance(int SkinTone, int HairStyle, int HairColor);

public sealed record BandAthlete(
    string Id,
    string Name,
    string Position,
    BandAppearance Appearance,
    int Overall,
    int? Age,
    bool Available,
    int Number,
    // SPEC-045: dica de elegibilidade do regen (tem vaga + idade >= mínima). Default false p/ o
    // cliente/servidor sem o campo (tolerante). É só render; o servidor é a autoridade (409).
    bool CanRegen = false
);

public sealed record BandBars(int Forma, int Moral);

public sealed record BandAttributes(int Fisico, int Tecnico, int Tatico, int Mental);

public sealed record BandTraining(
    BandAttributes Attributes,
    int TrainingXp,
    int NextThreshold,
    int FreePoints,
    string? LastFocus,
    int FocusStreak,
    int NextFocusPenaltyPct
);

public sealed record BandHome(
    long Balance,
    int LifestyleTier,
    bool HasMothersHouse,
    IReadOnlyList<string> OwnedItemIds,
    // SPEC-045: o catálogo de compras orientado ao atleta. Ausente/null num servidor antigo (tolerante).
    IReadOnlyList<BandPurchase>? Catalog = null
);

/// <summary>Um item do catálogo de compras (SPEC-045) — já com o estado do atleta
/// (owned/affordable/available). `available` = pode comprar agora; dica de render, o servidor revalida.</summary>
public sealed record BandPurchase(
    string Id,
    string Name,
    int Cost,
    string Kind,
    int? HousingTier,
    bool Owned,
    bool Affordable,
    bool Available
);

public sealed record BandInjury(
    string Severity,
    int StartedDay,
    int RecoveryDays,
    string Phase,
    int DaysLeft
);

public sealed record BandKit(int PrimaryColor, int SecondaryColor, int Crest);

public sealed record BandMatch(
    string OpponentClubId,
    string OpponentName,
    bool IsHome,
    bool Played,
    int? GoalsFor,
    int? GoalsAgainst,
    // SPEC-043/044: a timeline de gols (cronológica), orientada `isMine`. Ausente/null pré-jogo ou
    // num cliente/servidor sem o campo (tolerante). Default null p/ a desserialização e a construção.
    IReadOnlyList<BandGoal>? Goals = null,
    // SPEC-046: a minha NOTA na partida (3.0..10.0). Presente quando `played`; null pré-jogo ou num
    // servidor sem o campo (tolerante). É o herói do card de partida (SPEC-049).
    double? MyRating = null,
    // SPEC-048/050: os momentos de escolha SEUS na partida (presentes só pós-jogo). Ausente/null
    // pré-jogo ou num servidor sem o campo (tolerante). Default null — política aditiva-only do /v1.
    IReadOnlyList<BandMatchChoice>? Choices = null
);

/// <summary>Uma opção de um momento de escolha da partida (SPEC-050). `Risky` marca a opção arriscada
/// e `Attr` (fisico|tecnico|tatico|mental) diz qual atributo ela testa — ambos opcionais/tolerantes.</summary>
public sealed record BandChoiceOption(string Id, string Label, bool Risky = false, string? Attr = null);

/// <summary>Um momento de escolha da partida (SPEC-048/050), ancorado no `Minute` da timeline. O
/// cliente o apresenta NO MINUTO durante o replay (SPEC-044). `ChosenOptionId`/`Result` presentes =
/// já respondida (anotada pelo servidor); `Result` é 'success'|'fail'|'na'. Aditivo/tolerante.</summary>
public sealed record BandMatchChoice(
    int Minute,
    string TemplateId,
    string Type,
    string Prompt,
    IReadOnlyList<BandChoiceOption> Options,
    string? ChosenOptionId = null,
    string? Result = null,
    // SPEC-051 — a narrativa do DESFECHO, hidratada do catálogo pelo servidor (o cliente nunca tem
    // tabela de prosa) + o moral REALMENTE aplicado. Null = servidor antigo / sem prosa declarada /
    // opção que não mexe na moral → o card degrada para o feedback genérico.
    string? ResultTitle = null,
    string? ResultBody = null,
    int? MoralDelta = null
);

/// <summary>Um gol na timeline da partida (SPEC-043) — minuto + se foi do clube do humano. SPEC-046:
/// o artilheiro/assistente (`ByMe`/`Scorer`/`AssistByMe`/`Assist`). Os NOMES só vêm p/ gols do MEU
/// clube (a faixa não tem o elenco do adversário → null). Aditivo/tolerante: default p/ o cliente/
/// servidor sem os campos.</summary>
public sealed record BandGoal(
    int Minute,
    bool IsMine,
    bool ByMe = false,
    string? Scorer = null,
    bool AssistByMe = false,
    string? Assist = null
);

public sealed record BandClub(
    string ClubId,
    string Name,
    string LeagueId,
    int Tier,
    string Position,
    string SeasonId,
    BandKit Kit,
    int? Round,
    int? LastActiveDay,
    int? FrozenSinceDay,
    int? DaysUntilRevert,
    BandMatch? TodayMatch
);

public sealed record BandMate(
    string AthleteId,
    string Name,
    string Position,
    int Age,
    int Ability,
    bool IsHuman,
    bool IsMe,
    string AvatarSeed
);

public sealed record BandQueue(int Rank, int Total);

/// <summary>Uma opção de uma decisão pendente (SPEC-045) — `Id` responde a decisão, `Label` é o texto.</summary>
public sealed record BandDecisionOption(string Id, string Label);

/// <summary>Uma decisão de carreira pendente (SPEC-045) — o jogador responde na faixa. `Id` (uuid) é o
/// recurso; `TemplateId`/`Options[].Id` são localização-ready; `Prompt`/`Label` são o texto PT-BR.</summary>
public sealed record BandDecision(
    string Id,
    string TemplateId,
    string Type,
    string Prompt,
    IReadOnlyList<BandDecisionOption> Options
);

public sealed record BandState(
    string ContractVersion,
    BandTime ServerTime,
    string Phase,
    BandAthlete Athlete,
    BandBars Bars,
    BandTraining Training,
    BandHome Home,
    BandInjury? Injury,
    BandClub? Club,
    IReadOnlyList<BandMate> Squad,
    int PendingDecisions,
    BandQueue? Queue,
    // SPEC-045: a lista de decisões pendentes p/ o jogador responder. Ausente/null num servidor antigo.
    IReadOnlyList<BandDecision>? Decisions = null
);
