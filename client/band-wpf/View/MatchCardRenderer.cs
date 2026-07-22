using System.Globalization;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using static BandClient.View.CardDraw;

namespace BandClient.View;

/// <summary>Compõe o card de partida 1080×1080 (SPEC-049) por primitivas WPF → PNG, fiel ao handoff de
/// design (tokens, tipografia, os 5 estados). Thin renderer (OP-17): só apresenta o `MatchCardModel`,
/// zero regra de jogo. One-shot na UI thread; o bitmap sai congelado.</summary>
public sealed class MatchCardRenderer
{
    private const int Size = 1080;
    private const double L = 58,
        R = 1022,
        CX = 540,
        W = 964;
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    // Cores/tokens vêm de CardDraw (uma fonte só, `using static`): Ink100/300/500, Gold, GoldDeep,
    // OnAccent, Ink900 (o preto do card / texto do selo), WhiteC, GoldC.

    public BitmapSource Render(MatchCardModel m)
    {
        Theme th = ThemeFor(m.Result);
        var visual = new DrawingVisual();
        RenderOptions.SetEdgeMode(visual, EdgeMode.Aliased); // pixel-art: geometria sem antialias
        RenderOptions.SetBitmapScalingMode(visual, BitmapScalingMode.NearestNeighbor);
        using (DrawingContext dc = visual.RenderOpen())
        {
            Background(dc, th);
            Frame(dc, th);
            Identity(dc, m);
            Nota(dc, m);
            SealAndScore(dc, m, th);
            ChipsBlock(dc, m, th);
            Footer(dc, m);
        }
        var rtb = new RenderTargetBitmap(Size, Size, 96, 96, PixelFormats.Pbgra32);
        rtb.Render(visual);
        rtb.Freeze();
        return rtb;
    }

    private readonly record struct Theme(
        string Border,
        string Top,
        string Bottom,
        string Accent,
        string SealDark,
        double Glow,
        double Inner
    );

    private static Theme ThemeFor(MatchResultKind r) =>
        r switch
        {
            MatchResultKind.Win => new("1E7E43", "13291D", "0B121C", "35C46A", "1E7E43", 0.13, 0.28),
            MatchResultKind.Draw => new("3D4E80", "161D33", "0B0F1C", "8A93B4", "5A648A", 0.10, 0.28),
            _ => new("9E2620", "2A161C", "0B0F1C", "E0433B", "9E2620", 0.08, 0.25),
        };

    private void Background(DrawingContext dc, Theme th)
    {
        var grad = new LinearGradientBrush(Hex(th.Top), Hex(th.Bottom), 90);
        dc.DrawRectangle(grad, null, new Rect(0, 0, Size, Size));

        var glow = new RadialGradientBrush
        {
            GradientOrigin = new Point(0.5, 0.27),
            Center = new Point(0.5, 0.27),
            RadiusX = 0.62,
            RadiusY = 0.40,
        };
        glow.GradientStops.Add(new GradientStop(Color.FromArgb((byte)(th.Glow * 255), GoldC.R, GoldC.G, GoldC.B), 0));
        glow.GradientStops.Add(new GradientStop(Color.FromArgb(0, GoldC.R, GoldC.G, GoldC.B), 1));
        dc.DrawRectangle(glow, null, new Rect(0, 0, Size, Size));

        Brush scan = Alpha(WhiteC, 0.028);
        for (double y = 0; y < Size; y += 6)
            dc.DrawRectangle(scan, null, new Rect(0, y, Size, 2));
    }

    private static void Frame(DrawingContext dc, Theme th)
    {
        dc.DrawRectangle(null, new Pen(Brush(th.Border), 6), new Rect(3, 3, Size - 6, Size - 6));
        dc.DrawRectangle(null, new Pen(Alpha(Hex(th.Accent), th.Inner), 2), new Rect(7, 7, Size - 14, Size - 14));
        dc.DrawRectangle(null, new Pen(Alpha(Hex("000000"), 0.25), 14), new Rect(13, 13, Size - 26, Size - 26));
    }

    private void Identity(DrawingContext dc, MatchCardModel m)
    {
        dc.DrawText(Ft(m.PlayerName, PixelBold, 54, Ink100, 700, ellipsis: true), new Point(L, 56));
        string mando = m.IsHome ? "EM CASA" : "FORA DE CASA";
        dc.DrawText(Ft($"{m.ClubName} · {mando}", PixelReg, 27, Ink300, 740, ellipsis: true), new Point(L, 124));
        Badge(dc, m);
    }

    private void Badge(DrawingContext dc, MatchCardModel m)
    {
        const double h = 58,
            top = 58;
        FormattedText pos = Ft(m.PositionLabel, PixelBold, 26, OnAccent);
        FormattedText num = Ft(m.ShirtNumber.ToString(Inv), Silk, 30, Ink100);
        double posW = pos.Width + 32,
            numW = num.Width + 36,
            left = R - (posW + numW);
        dc.DrawRectangle(Brush("E8722A"), null, new Rect(left, top, posW, h));
        dc.DrawText(pos, new Point(left + 16, top + (h - pos.Height) / 2));
        dc.DrawRectangle(Brush("0F1424"), null, new Rect(left + posW, top, numW, h));
        dc.DrawText(num, new Point(left + posW + 18, top + (h - num.Height) / 2));
        dc.DrawRectangle(null, new Pen(Brush("3D4E80"), 2), new Rect(left, top, posW + numW, h));
    }

    private void Nota(DrawingContext dc, MatchCardModel m)
    {
        Spaced(dc, "SUA NOTA", PixelReg, 30, Ink300, CX, 188, 30 * 0.24);
        string num = m.Rating.ToString("0.0", Inv);
        FormattedText main = Ft(num, Silk, 280, Gold);
        double nx = CX - main.Width / 2,
            ny = 220;
        dc.DrawText(Ft(num, Silk, 280, GoldDeep), new Point(nx, ny + 10)); // sombra dura 0,10
        dc.DrawText(main, new Point(nx, ny));
    }

    private void SealAndScore(DrawingContext dc, MatchCardModel m, Theme th)
    {
        string seal = m.Result switch
        {
            MatchResultKind.Win => "VITÓRIA",
            MatchResultKind.Draw => "EMPATE",
            _ => "DERROTA",
        };
        double track = 32 * 0.14;
        double sealW = MeasureSpaced(seal, PixelBold, 32, track) + 68,
            sealH = 56,
            sealTop = 556;
        double sealLeft = CX - sealW / 2;
        dc.DrawRectangle(Brush(th.SealDark), null, new Rect(sealLeft, sealTop + 5, sealW, sealH));
        dc.DrawRectangle(Brush(th.Accent), null, new Rect(sealLeft, sealTop, sealW, sealH));
        Spaced(dc, seal, PixelBold, 32, Ink900, CX, sealTop + 11, track);
        Score(dc, m);
    }

    private void Score(DrawingContext dc, MatchCardModel m)
    {
        const double top = 636,
            gap = 18;
        FormattedText n1 = Ft(m.GoalsFor.ToString(Inv), Silk, 92, Ink100);
        FormattedText tx = Ft("×", Body, 56, Ink500);
        FormattedText n2 = Ft(m.GoalsAgainst.ToString(Inv), Silk, 92, Ink100);
        double total = n1.Width + gap + tx.Width + gap + n2.Width;
        double sx = CX - total / 2;
        dc.DrawText(n1, new Point(sx, top));
        dc.DrawText(tx, new Point(sx + n1.Width + gap, top + (n1.Height - tx.Height) / 2));
        dc.DrawText(n2, new Point(sx + n1.Width + gap + tx.Width + gap, top));

        FormattedText mine = Ft(m.ClubName, PixelBold, 36, Ink100, sx - 30 - L, TextAlignment.Right, true);
        FormattedText opp = Ft(m.OpponentName, PixelBold, 36, Ink300, R - (sx + total + 30), TextAlignment.Left, true);
        double nameY = top + (n1.Height - mine.Height) / 2;
        dc.DrawText(mine, new Point(L, nameY));
        dc.DrawText(opp, new Point(sx + total + 30, nameY));
    }

    private void ChipsBlock(DrawingContext dc, MatchCardModel m, Theme th)
    {
        const double centerY = 818;
        if (m.Chips.Count == 0)
        {
            FormattedText t = Ft("SEM GOLS", PixelReg, 28, Ink500);
            double bw = t.Width + 60,
                bh = 56;
            var pen = new Pen(Alpha(WhiteC, 0.18), 1) { DashStyle = new DashStyle(new double[] { 4, 3 }, 0) };
            dc.DrawRectangle(null, pen, new Rect(CX - bw / 2, centerY - bh / 2, bw, bh));
            dc.DrawText(t, new Point(CX - t.Width / 2, centerY - t.Height / 2));
            return;
        }

        double scale = m.Chips.Count >= 4 ? 0.82 : 1.0;
        List<Chip> chips = m.Chips.Select(c => Chip.Build(c, th.Accent, scale)).ToList();
        List<List<Chip>> rows = WrapRows(chips, 20 * scale);
        double chipH = 58 * scale,
            rowGap = 12;
        double blockH = rows.Count * chipH + (rows.Count - 1) * rowGap;
        double y = centerY - blockH / 2;
        foreach (List<Chip> row in rows)
        {
            double rowW = row.Sum(c => c.Width) + (row.Count - 1) * 20 * scale;
            double x = CX - rowW / 2;
            foreach (Chip c in row)
            {
                c.Draw(dc, x, y, chipH, scale);
                x += c.Width + 20 * scale;
            }
            y += chipH + rowGap;
        }
    }

    // Empacota os chips em linhas de no máx. W (964) — a régua "≤3 por linha" do design + robustez p/
    // muitos gols (quebra em linhas, o bloco cresce simetricamente em torno do centro).
    private static List<List<Chip>> WrapRows(List<Chip> chips, double gap)
    {
        var rows = new List<List<Chip>> { new() };
        double used = 0;
        foreach (Chip c in chips)
        {
            List<Chip> row = rows[^1];
            double add = (row.Count == 0 ? 0 : gap) + c.Width;
            if (row.Count > 0 && used + add > W)
            {
                rows.Add(new List<Chip> { c });
                used = c.Width;
            }
            else
            {
                row.Add(c);
                used += add;
            }
        }
        return rows;
    }

    private void Footer(DrawingContext dc, MatchCardModel m)
    {
        dc.DrawRectangle(Alpha(WhiteC, 0.1), null, new Rect(L, 940, W, 1));
        const double cy = 968;
        Spaced(dc, $"TEMPORADA {m.SeasonNumber} · RODADA {m.Round}", Silk, 22, Ink500, L, cy - 11, 22 * 0.08, TextAlignment.Left);

        double goatH = 52,
            goatW = goatH * 384 / 496,
            crownW = 26,
            crownH = CrownHeight(crownW),
            gap = 14;
        FormattedText next = Ft("NEXT", PixelBold, 28, Ink100);
        FormattedText goat = Ft("GOAT", PixelBold, 28, Gold);
        const double wordGap = 10; // "NEXT GOAT" — o espaço do Pixelify é estreito; abre o wordmark
        double x = R - (goatW + gap + crownW + gap + next.Width + wordGap + goat.Width);
        dc.DrawImage(Goat, new Rect(x, cy - goatH / 2, goatW, goatH));
        x += goatW + gap;
        Crown(dc, x, cy - crownH / 2, crownW, -12);
        x += crownW + gap;
        double wy = cy - next.Height / 2;
        dc.DrawText(next, new Point(x, wy));
        dc.DrawText(goat, new Point(x + next.Width + wordGap, wy));
    }
}
