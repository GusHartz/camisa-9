using System.Collections.Generic;
using System.Windows.Media;

namespace BandClient.View;

/// <summary>
/// A paleta do handoff da faixa (SPEC-052), espelhada com a MESMA nomenclatura do design
/// (`PAL.n0..n6`, `or/or4/or6/or7`, `gold*`, `f*`, `clay*`, `dawn*`, `night*`, `wall*`) — fonte
/// única, reusada pela fatia 2 (avatar). Todos os brushes são congelados na carga: um cenário é
/// composto uma vez por chave e cacheado, então nada aqui é alocado por repintura.
/// </summary>
internal static class ScenePalette
{
    // ⚠️ DECLARADO PRIMEIRO de propósito: inicializadores de campo estático rodam em ordem de
    // declaração, e todos os brushes abaixo chamam `B(...)`. Com o cache no fim da classe, o
    // primeiro `B` acha `Cache` nulo e o type initializer explode.
    private static readonly Dictionary<string, Brush> Cache = new();

    // Navy — o substrato
    internal static readonly Brush Out = B("#0A0D16");
    internal static readonly Brush N0 = B("#0B0F1C");
    internal static readonly Brush N1 = B("#0F1424");
    internal static readonly Brush N2 = B("#131A2E");
    internal static readonly Brush N3 = B("#1B2440");
    internal static readonly Brush N4 = B("#232F52");
    internal static readonly Brush N5 = B("#2E3D68");
    internal static readonly Brush N6 = B("#3D4E80");

    // Ink — texto
    internal static readonly Brush Ink = B("#EAF0FF");
    internal static readonly Brush Ink3 = B("#A9B4D0");
    internal static readonly Brush Ink5 = B("#6B769A");

    // Laranja — o acento
    internal static readonly Brush Or = B("#E8722A");
    internal static readonly Brush Or4 = B("#F5904F");
    internal static readonly Brush Or7 = B("#A8480F");

    // Ouro — GLÓRIA (troféus)
    internal static readonly Brush Gold = B("#E8C168");
    internal static readonly Brush Gold6 = B("#C79A3E");
    internal static readonly Brush Gold7 = B("#A87E2C");

    // Mundo — cenário (campo, barro)
    internal static readonly Brush F5 = B("#2E8B4E");
    internal static readonly Brush F7 = B("#1C5A2C");
    internal static readonly Brush F8 = B("#14431F");
    internal static readonly Brush Clay5 = B("#C46A3D");
    internal static readonly Brush Clay6 = B("#A85632");
    internal static readonly Brush Clay7 = B("#7E3F22");
    internal static readonly Brush Wood = B("#5A3F26");
    internal static readonly Brush Wood2 = B("#4A3320");
    internal static readonly Brush Chalk = B("#E7E0CA");

    // Resultado
    internal static readonly Brush Win = B("#35C46A");
    internal static readonly Brush Loss = B("#E0433B");
    internal static readonly Brush Draw = B("#8A93B4");

    // Amanhecer (CT)
    internal static readonly Brush DawnTop = B("#1C2942");
    internal static readonly Brush DawnMid = B("#394E6E");
    internal static readonly Brush DawnWarm = B("#B5764A");
    internal static readonly Brush DawnWarm2 = B("#E8A86A");
    internal static readonly Brush Sun = B("#F3D78F");

    // Noite (cobertura)
    internal static readonly Brush Night = B("#0E1A33");
    internal static readonly Brush Night2 = B("#16233F");
    internal static readonly Brush CityLight = B("#F3D78F");
    internal static readonly Brush MoonCore = B("#FBEBBD");

    // Pensão
    internal static readonly Brush Wall = B("#3A2A22");
    internal static readonly Brush Wall2 = B("#4A362B");
    internal static readonly Brush FloorW = B("#4A3320");

    /// O scrim de base do handoff: preto a 5% sobre as 10 linhas de baixo, para o texto ler em
    /// qualquer fundo. Um retângulo só (o loop do original repinta 10 linhas com o MESMO alpha —
    /// é véu chapado, não rampa; divergência registrada na devolutiva).
    internal static readonly Brush BaseScrim = B("#0D000000");

    /// Brush congelado por hex (`#RRGGBB` ou `#AARRGGBB`), memoizado — o cenário repete muita cor.
    internal static Brush B(string hex)
    {
        if (Cache.TryGetValue(hex, out Brush? cached))
            return cached;
        SolidColorBrush brush = new((Color)ColorConverter.ConvertFromString(hex));
        brush.Freeze();
        Cache[hex] = brush;
        return brush;
    }
}
