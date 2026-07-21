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
    int Number
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
    IReadOnlyList<string> OwnedItemIds
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
    int? GoalsAgainst
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
    BandQueue? Queue
);
