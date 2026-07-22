using System.Globalization;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace BandClient.View;

/// <summary>Primitivas de desenho do card (SPEC-049) — tipos de letra embarcados, cores dos tokens,
/// texto com tracking (letter-spacing, que o WPF não faz nativo), o ícone de bola pixel e a coroa
/// pixel. Tudo estático e congelado (um render é one-shot na UI thread).</summary>
internal static class CardDraw
{
    private static readonly Uri Base = new("pack://application:,,,/");

    private static FontFamily Fam(string name) => new(Base, "./Assets/fonts/#" + name);

    // Pixelify Sans (variável — o WPF usa a instância default 400 e sintetiza o "bold"; aceitável no
    // pixel-art, confere no smoke). Silkscreen (numérica, tabular). Segoe UI (corpo — a assistência).
    internal static readonly Typeface PixelBold =
        new(Fam("Pixelify Sans"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal);
    internal static readonly Typeface PixelReg =
        new(Fam("Pixelify Sans"), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);
    internal static readonly Typeface Silk =
        new(Fam("Silkscreen"), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);
    internal static readonly Typeface Body =
        new(new FontFamily("Segoe UI"), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);

    internal static Color Hex(string hex)
    {
        hex = hex.TrimStart('#');
        return Color.FromRgb(
            byte.Parse(hex[..2], NumberStyles.HexNumber),
            byte.Parse(hex.Substring(2, 2), NumberStyles.HexNumber),
            byte.Parse(hex.Substring(4, 2), NumberStyles.HexNumber)
        );
    }

    internal static SolidColorBrush Brush(string hex) => Frozen(Hex(hex));

    internal static SolidColorBrush Alpha(Color c, double a) =>
        Frozen(Color.FromArgb((byte)Math.Round(a * 255), c.R, c.G, c.B));

    private static SolidColorBrush Frozen(Color c)
    {
        var b = new SolidColorBrush(c);
        b.Freeze();
        return b;
    }

    internal static FormattedText Ft(
        string text,
        Typeface tf,
        double size,
        Brush brush,
        double maxWidth = double.PositiveInfinity,
        TextAlignment align = TextAlignment.Left,
        bool ellipsis = false
    )
    {
        var ft = new FormattedText(
            text ?? "",
            CultureInfo.InvariantCulture,
            FlowDirection.LeftToRight,
            tf,
            size,
            brush,
            1.0
        )
        {
            TextAlignment = align,
        };
        if (!double.IsPositiveInfinity(maxWidth))
        {
            ft.MaxTextWidth = maxWidth;
            ft.MaxLineCount = 1;
            if (ellipsis)
                ft.Trimming = TextTrimming.CharacterEllipsis;
        }
        return ft;
    }

    /// <summary>Desenha texto com tracking (letter-spacing) char-a-char — o WPF não suporta nativo.
    /// `anchorX` é o centro (align=Center) ou a borda esquerda (align=Left). `y` é o topo do texto.</summary>
    internal static void Spaced(
        DrawingContext dc,
        string text,
        Typeface tf,
        double size,
        Brush brush,
        double anchorX,
        double y,
        double tracking,
        TextAlignment align = TextAlignment.Center
    )
    {
        double total = 0;
        var glyphs = new List<(FormattedText Ft, double W)>();
        foreach (char ch in text)
        {
            FormattedText g = Ft(ch.ToString(), tf, size, brush);
            double w = g.WidthIncludingTrailingWhitespace;
            glyphs.Add((g, w));
            total += w;
        }
        total += tracking * Math.Max(0, text.Length - 1);
        double x = align == TextAlignment.Center ? anchorX - total / 2 : anchorX;
        foreach ((FormattedText g, double w) in glyphs)
        {
            dc.DrawText(g, new Point(x, y));
            x += w + tracking;
        }
    }

    /// <summary>Largura de um texto com tracking (sem desenhar) — p/ dimensionar caixas (o selo).</summary>
    internal static double MeasureSpaced(string text, Typeface tf, double size, double tracking)
    {
        double total = 0;
        foreach (char ch in text)
            total += Ft(ch.ToString(), tf, size, Ink100).WidthIncludingTrailingWhitespace;
        return total + tracking * Math.Max(0, text.Length - 1);
    }

    // A bolinha pixel do chip de gol (o SVG 8×8 do design: branca com 5 pixels pretos em cruz).
    internal static void Ball(DrawingContext dc, double x, double y, double size)
    {
        double u = size / 8.0;
        dc.DrawRectangle(Ink100, null, new Rect(x, y, size, size));
        foreach ((int cx, int cy) in new[] { (3, 0), (0, 3), (6, 3), (3, 6), (3, 3) })
            dc.DrawRectangle(Ink900, null, new Rect(x + cx * u, y + cy * u, 2 * u, 2 * u));
    }

    // Tokens do design system Next Goat — compartilhados pelo renderer e pelos chips (uma fonte só).
    internal static readonly Brush Ink100 = Brush("EAF0FF");
    internal static readonly Brush Ink300 = Brush("A9B4D0");
    internal static readonly Brush Ink500 = Brush("6B769A");
    internal static readonly Brush Ink900 = Brush("0B0F1C"); // preto do card / texto sobre o selo
    internal static readonly Brush Gold = Brush("E8C168"); // GLÓRIA — só a nota, o "VOCÊ" e a coroa
    internal static readonly Brush GoldDeep = Brush("A87E2C");
    internal static readonly Brush OnAccent = Brush("2A1405"); // texto sobre o laranja do badge
    internal static readonly Color WhiteC = Hex("EAF0FF");
    internal static readonly Color GoldC = Hex("E8C168");
    private static readonly Brush CrownGold = Brush("E8C168");
    private static readonly Brush CrownDeep = Brush("C79A3E");

    // A coroa pixel (crown.svg do handoff): grade 11×7 (8px/unidade). Linhas 0-3 = ouro (as pontas),
    // 4-6 = ouro-fundo (a base). `w` é a largura-alvo; rotaciona `angle°` em torno do centro.
    private static readonly int[][] CrownGoldCells =
    {
        new[] { 5 }, // linha 0
        new[] { 0, 5, 10 }, // 1
        new[] { 0, 3, 5, 7, 10 }, // 2
        new[] { 0, 1, 3, 4, 5, 6, 7, 9, 10 }, // 3
    };
    private static readonly int[][] CrownDeepCells =
    {
        new[] { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 }, // linha 4
        new[] { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 }, // 5
        new[] { 0, 2, 4, 6, 8, 10 }, // 6
    };

    internal static double CrownHeight(double w) => 7 * (w / 11.0);

    internal static void Crown(DrawingContext dc, double x, double y, double w, double angle)
    {
        double u = w / 11.0;
        double h = 7 * u;
        dc.PushTransform(new RotateTransform(angle, x + w / 2, y + h / 2));
        DrawCells(dc, CrownGoldCells, 0, x, y, u, CrownGold);
        DrawCells(dc, CrownDeepCells, 4, x, y, u, CrownDeep);
        dc.Pop();
    }

    private static void DrawCells(
        DrawingContext dc,
        int[][] rows,
        int rowOffset,
        double x,
        double y,
        double u,
        Brush brush
    )
    {
        for (int r = 0; r < rows.Length; r++)
            foreach (int col in rows[r])
                dc.DrawRectangle(brush, null, new Rect(x + col * u, y + (r + rowOffset) * u, u, u));
    }

    // O mascote do rodapé (goat-idle.png), carregado uma vez e congelado. Resource embarcado no exe.
    private static BitmapSource? _goat;

    internal static BitmapSource Goat =>
        _goat ??= Load("pack://application:,,,/Assets/goat-idle.png");

    private static BitmapSource Load(string uri)
    {
        var bmp = new BitmapImage();
        bmp.BeginInit();
        bmp.UriSource = new Uri(uri);
        bmp.CacheOption = BitmapCacheOption.OnLoad;
        bmp.EndInit();
        bmp.Freeze();
        return bmp;
    }
}
