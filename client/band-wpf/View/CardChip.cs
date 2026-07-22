using System.Windows;
using System.Windows.Media;

namespace BandClient.View;

/// <summary>Um chip de gol pré-medido do card (SPEC-049): a bolinha pixel + minuto (acento) + rótulo
/// (VOCÊ em ouro / nome do artilheiro) + assistência opcional. Mede-se na construção (o layout empacota
/// os chips em linhas); desenha-se com o fundo/borda translúcidos do design.</summary>
internal sealed class Chip
{
    private readonly FormattedText _minute;
    private readonly FormattedText _label;
    private readonly FormattedText? _assist;

    public double Width { get; }

    private Chip(FormattedText minute, FormattedText label, FormattedText? assist, double scale)
    {
        _minute = minute;
        _label = label;
        _assist = assist;
        double padH = 24 * scale,
            ball = 22 * scale,
            gapIn = 14 * scale;
        Width =
            padH
            + ball
            + gapIn
            + minute.Width
            + gapIn
            + label.Width
            + (assist is null ? 0 : gapIn + assist.Width)
            + padH;
    }

    public static Chip Build(CardGoalChip c, string accentHex, double scale)
    {
        Brush accent = CardDraw.Brush(accentHex);
        FormattedText minute = CardDraw.Ft($"{c.Minute}'", CardDraw.Silk, 26 * scale, accent);
        // Clampa o nome/assist com ellipsis (a régra "nomes longos → ellipsis" do design, que a
        // identidade/placar já aplicam) — um nome patológico não estoura o chip nem sai da borda.
        FormattedText label = CardDraw.Ft(
            c.Label,
            CardDraw.PixelBold,
            30 * scale,
            c.LabelIsGold ? CardDraw.Gold : CardDraw.Ink100,
            420 * scale,
            ellipsis: true
        );
        FormattedText? assist =
            c.Assist is null
                ? null
                : CardDraw.Ft(
                    c.Assist,
                    CardDraw.Body,
                    24 * scale,
                    c.AssistIsGold ? CardDraw.Gold : CardDraw.Ink300,
                    300 * scale,
                    ellipsis: true
                );
        return new Chip(minute, label, assist, scale);
    }

    public void Draw(DrawingContext dc, double x, double y, double h, double scale)
    {
        double padH = 24 * scale,
            ball = 22 * scale,
            gapIn = 14 * scale;
        dc.DrawRectangle(BgBrush, BorderPen, new Rect(x, y, Width, h));
        double cx = x + padH;
        CardDraw.Ball(dc, cx, y + (h - ball) / 2, ball);
        cx += ball + gapIn;
        dc.DrawText(_minute, new Point(cx, y + (h - _minute.Height) / 2));
        cx += _minute.Width + gapIn;
        dc.DrawText(_label, new Point(cx, y + (h - _label.Height) / 2));
        cx += _label.Width;
        if (_assist is { } a)
            dc.DrawText(a, new Point(cx + gapIn, y + (h - a.Height) / 2));
    }

    private static readonly Brush BgBrush = CardDraw.Alpha(CardDraw.WhiteC, 0.05);
    private static readonly Pen BorderPen = new(CardDraw.Alpha(CardDraw.WhiteC, 0.10), 1);
}
