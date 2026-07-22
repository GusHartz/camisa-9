using System.Windows;
using System.Windows.Media;

namespace BandClient.View;

/// <summary>
/// As DUAS primitivas do handoff (SPEC-052) sobre um <see cref="DrawingContext"/>: `R` (retângulo)
/// e `P` (1 pixel). O design inteiro — cenas e, depois, o avatar — é escrito só com elas, em
/// coordenadas do grid LÓGICO 120×28; aqui elas viram retângulos em DIP multiplicando pela escala.
///
/// Escala fixa **4 DIP por pixel lógico** (480/120): as três alturas da faixa saem inteiras
/// (16·4=64 · 22·4=88 · 28·4=112), o que mantém o pixel art nítido em qualquer DPI.
/// </summary>
internal sealed class PixelCanvas
{
    internal const int LogicalWidth = 120;
    internal const int LogicalHeight = 28;
    internal const double Scale = 4;

    private readonly DrawingContext _dc;

    internal PixelCanvas(DrawingContext dc) => _dc = dc;

    /// Retângulo em coordenadas lógicas (o `R(x,y,w,h,c)` do handoff).
    internal void R(double x, double y, double w, double h, Brush color) =>
        _dc.DrawRectangle(color, null, new Rect(x * Scale, y * Scale, w * Scale, h * Scale));

    /// Um pixel lógico (o `P(x,y,c)` do handoff).
    internal void P(double x, double y, Brush color) => R(x, y, 1, 1, color);

    // A fonte bitmap 3×5 do handoff (avanço de 4), usada no placar aceso da véspera. Só dígitos —
    // o original também tenta desenhar '?' num estado do avatar, mas o mapa não o tem (defeito
    // registrado na devolutiva); aqui um caractere desconhecido simplesmente não desenha.
    private static readonly string[] Digits =
    {
        "111101101101111", // 0
        "010110010010111", // 1
        "111001111100111", // 2
        "111001111001111", // 3
        "101101111001001", // 4
        "111100111001111", // 5
        "111100111101111", // 6
        "111001001010010", // 7
        "111101111101111", // 8
        "111101111001111", // 9
    };

    /// Escreve um número na fonte 3×5 (o `num(ctx,x,y,str,c)` do handoff).
    internal void Num(double x, double y, string text, Brush color)
    {
        for (int i = 0; i < text.Length; i++)
        {
            char ch = text[i];
            if (ch < '0' || ch > '9')
                continue;
            string glyph = Digits[ch - '0'];
            for (int row = 0; row < 5; row++)
                for (int col = 0; col < 3; col++)
                    if (glyph[row * 3 + col] == '1')
                        P(x + i * 4 + col, y + row, color);
        }
    }
}
