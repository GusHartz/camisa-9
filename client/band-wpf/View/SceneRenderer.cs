using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace BandClient.View;

/// <summary>
/// O CENÁRIO da faixa (SPEC-052) — o port das 4 pinturas do handoff do Claude Design, desenhadas
/// num grid lógico 120×28 só com `R`/`P` (<see cref="PixelCanvas"/>). Zero dependência, zero asset.
///
/// ⚠️ **Determinismo**: o handoff usa `Math.random()` em dois pontos (janelas do prédio no CT,
/// luzes da laje na pensão) — 25 pixels que mudariam a cada repintura, fazendo a arte piscar. Aqui
/// viram MÁSCARA determinística, no idioma que as outras cenas do próprio handoff já usam.
///
/// ⚠️ **Faixa segura**: o handoff define que tudo essencial mora nas 16 linhas de baixo (12-27),
/// porque a altura compacta corta o topo — mas desenha o placar aceso nas linhas 2-9, que somem em
/// 64px. Aqui o placar foi movido para dentro da faixa segura (divergência registrada no DONE).
///
/// A composição é CARA o suficiente para nunca acontecer por poll: <see cref="Compose"/> devolve um
/// bitmap congelado e o chamador o cacheia por <see cref="SceneKey"/>.
/// </summary>
internal static class SceneRenderer
{
    /// Quantas linhas lógicas cabem numa altura de faixa (o corte é ancorado EMBAIXO).
    internal static int LogicalRowsFor(double heightDip) =>
        heightDip >= 112 ? 28 : heightDip >= 88 ? 22 : 16;

    /// Compõe a cena da chave numa imagem congelada, já recortada para a altura pedida.
    internal static BitmapSource Compose(SceneKey key)
    {
        int rows = LogicalRowsFor(key.HeightDip);
        DrawingVisual visual = new();
        using (DrawingContext dc = visual.RenderOpen())
        {
            // O recorte: descarta as linhas de cima e ancora no chão — uma arte só, 3 alturas.
            dc.PushTransform(
                new TranslateTransform(0, -(PixelCanvas.LogicalHeight - rows) * PixelCanvas.Scale)
            );
            Draw(new PixelCanvas(dc), key);
            dc.Pop();
        }
        RenderTargetBitmap bmp =
            new(
                (int)(PixelCanvas.LogicalWidth * PixelCanvas.Scale),
                (int)(rows * PixelCanvas.Scale),
                96,
                96,
                PixelFormats.Pbgra32
            );
        RenderOptions.SetEdgeMode(visual, EdgeMode.Aliased);
        bmp.Render(visual);
        bmp.Freeze();
        return bmp;
    }

    private static void Draw(PixelCanvas g, SceneKey key)
    {
        switch (key.Phase)
        {
            case ScenePhase.Ct:
                DrawCt(g);
                break;
            case ScenePhase.Vespera:
                DrawVespera(g, key);
                break;
            default:
                if (key.Penthouse)
                    DrawCasaPenthouse(g);
                else
                    DrawCasaPensao(g);
                break;
        }
        // Scrim de base: as 10 linhas de baixo escurecem 5% para o texto ler em qualquer fundo.
        g.R(0, 18, 120, 10, ScenePalette.BaseScrim);
    }

    // ================= CT — o centro de treinamento ao amanhecer =================
    private static void DrawCt(PixelCanvas g)
    {
        g.R(0, 0, 120, 28, ScenePalette.DawnTop);
        g.R(0, 3, 120, 4, ScenePalette.DawnMid);
        g.R(0, 7, 120, 3, ScenePalette.DawnWarm);
        g.R(0, 9, 120, 2, ScenePalette.B("#7A5A52"));
        g.R(88, 1, 8, 7, ScenePalette.DawnWarm2); // sol
        g.R(90, 2, 4, 4, ScenePalette.Sun);

        g.R(0, 10, 120, 4, ScenePalette.B("#12182A")); // prédios ao fundo
        for (int x = 3; x < 118; x += 6)
        {
            // DETERMINÍSTICO (era Math.random()<0.3): mesma densidade, sem piscar.
            bool lit = (x * 7 + 3) % 10 < 3;
            g.P(x, 11, lit ? ScenePalette.DawnWarm2 : ScenePalette.B("#1E2740"));
            g.P(x + 1, 12, ScenePalette.B("#1E2740"));
        }

        for (int x = 0; x < 120; x += 3)
            g.P(x, 14, ScenePalette.Ink5); // alambrado

        g.R(0, 15, 120, 10, ScenePalette.F7); // campo + faixas de corte
        for (int x = 0; x < 120; x += 12)
            g.R(x, 15, 6, 10, ScenePalette.F8);

        g.R(3, 15, 1, 7, ScenePalette.Chalk); // gol
        g.R(3, 15, 11, 1, ScenePalette.Chalk);
        g.R(13, 15, 1, 7, ScenePalette.Chalk);
        for (int y = 16; y < 22; y++)
            for (int x = 4; x < 13; x += 2)
                g.P(x, y, ScenePalette.B("#2C4A38")); // rede

        for (int x = 18; x < 40; x++)
            if (x * 7 % 5 < 2)
                g.P(x, 21, ScenePalette.Chalk); // meia-lua de cal

        g.R(30, 22, 2, 2, ScenePalette.Or); // cones
        g.R(46, 20, 2, 2, ScenePalette.Or4);
        g.R(58, 23, 2, 2, ScenePalette.Or);

        g.R(0, 24, 120, 4, ScenePalette.Clay7); // barro em 1º plano
        g.R(0, 24, 120, 1, ScenePalette.Clay6);

        g.R(20, 25, 3, 3, ScenePalette.Chalk); // bola
        g.P(21, 26, ScenePalette.Out);
        g.P(22, 25, ScenePalette.Out);

        g.R(70, 21, 20, 1, ScenePalette.Wood); // banco
        g.R(72, 22, 1, 2, ScenePalette.Wood2);
        g.R(88, 22, 1, 2, ScenePalette.Wood2);

        g.R(98, 13, 20, 11, ScenePalette.Wood2); // banca de jornal do mundo
        g.R(98, 13, 20, 1, ScenePalette.Clay6);
        g.R(100, 15, 16, 4, ScenePalette.Or7); // toldo
        g.R(101, 19, 7, 5, ScenePalette.Chalk);
        for (int y = 20; y < 24; y++)
        {
            g.P(102, y, ScenePalette.Ink5);
            g.P(104, y, ScenePalette.Ink5);
            g.P(106, y, ScenePalette.Ink5);
        }
        g.R(109, 19, 6, 5, ScenePalette.Chalk);
        for (int y = 20; y < 24; y++)
        {
            g.P(110, y, ScenePalette.Ink5);
            g.P(112, y, ScenePalette.Ink5);
        }
    }

    // ================= CASA — pensão (degraus baixos da escada) =================
    private static void DrawCasaPensao(PixelCanvas g)
    {
        g.R(0, 0, 120, 22, ScenePalette.Wall);
        g.R(0, 0, 120, 2, ScenePalette.B("#2E211A"));
        g.R(58, 6, 10, 7, ScenePalette.Wall2); // reboco descascado
        g.R(20, 14, 8, 5, ScenePalette.B("#31241D"));

        g.R(8, 4, 26, 10, ScenePalette.B("#20160F")); // janela p/ a laje
        g.R(9, 5, 24, 8, ScenePalette.DawnMid);
        g.R(9, 10, 24, 3, ScenePalette.B("#12182A"));
        for (int x = 11; x < 32; x += 5)
            if (x % 10 < 5) // DETERMINÍSTICO (era Math.random()<0.5)
                g.P(x, 11, ScenePalette.DawnWarm2);
        g.R(20, 5, 1, 8, ScenePalette.B("#20160F"));
        g.R(9, 9, 24, 1, ScenePalette.B("#20160F"));

        g.R(78, 0, 1, 4, ScenePalette.B("#0D0D0D")); // lâmpada pendente
        g.R(77, 4, 3, 3, ScenePalette.Gold);
        g.R(76, 4, 1, 3, ScenePalette.Gold7);

        g.R(90, 3, 16, 11, ScenePalette.Clay7); // pôster
        g.R(92, 5, 12, 3, ScenePalette.Or);
        g.R(92, 9, 12, 3, ScenePalette.Ink5);

        g.R(0, 22, 120, 6, ScenePalette.FloorW); // piso de tábuas
        g.R(0, 22, 120, 1, ScenePalette.B("#5A4028"));
        for (int x = 0; x < 120; x += 14)
            g.R(x, 23, 1, 5, ScenePalette.B("#3A2A18"));

        g.R(30, 24, 46, 3, ScenePalette.B("#7A6A55")); // colchão no chão
        g.R(30, 24, 46, 1, ScenePalette.B("#8E7E68"));
        g.R(30, 23, 12, 2, ScenePalette.Chalk); // travesseiro

        g.R(14, 20, 12, 4, ScenePalette.Wood); // engradado-mesa
        g.R(14, 20, 12, 1, ScenePalette.Clay6);

        g.R(92, 15, 22, 9, ScenePalette.B("#1A1A1A")); // TV de tubo
        g.R(94, 16, 15, 6, ScenePalette.B("#0D0D0D"));
        g.R(95, 17, 13, 4, ScenePalette.F7);
        g.P(101, 18, ScenePalette.Chalk);
        g.R(109, 16, 4, 6, ScenePalette.B("#2A2A2A"));
        g.R(101, 14, 1, 2, ScenePalette.B("#3A3A3A")); // antenas
        g.R(105, 14, 1, 2, ScenePalette.B("#3A3A3A"));
    }

    // ================= CASA — cobertura (topo da escada) =================
    private static readonly int[] Skyline = { 10, 7, 13, 9, 15, 8, 11, 14, 9, 12, 7, 13, 10, 8, 12, 9, 14, 11 };

    private static void DrawCasaPenthouse(PixelCanvas g)
    {
        g.R(0, 0, 120, 28, ScenePalette.Night);
        g.R(2, 1, 116, 20, ScenePalette.B("#0B0F1C")); // esquadria
        g.R(4, 2, 112, 18, ScenePalette.Night);

        int bx = 5;
        for (int i = 0; i < Skyline.Length; i++)
        {
            int h = Skyline[i];
            const int w = 6;
            g.R(bx, 20 - h, w, h, ScenePalette.Night2);
            for (int yy = 20 - h + 1; yy < 20; yy += 2)
                for (int xx = bx + 1; xx < bx + w - 1; xx += 2)
                    if ((xx + yy + i) % 3 == 0)
                        g.P(xx, yy, ScenePalette.CityLight);
            bx += w;
        }

        g.R(96, 3, 6, 6, ScenePalette.B("#0B0F1C")); // lua
        g.R(97, 3, 5, 5, ScenePalette.Sun);
        g.R(99, 4, 3, 3, ScenePalette.MoonCore);

        g.R(4, 20, 112, 1, ScenePalette.N5); // peitoril
        g.R(0, 22, 120, 6, ScenePalette.N2); // piso
        g.R(0, 22, 120, 1, ScenePalette.N4);

        g.R(8, 16, 42, 7, ScenePalette.N4); // sofá
        g.R(8, 15, 42, 2, ScenePalette.N5);
        g.R(10, 17, 10, 4, ScenePalette.N5);
        g.R(22, 17, 10, 4, ScenePalette.N5);
        g.R(34, 17, 10, 4, ScenePalette.N5);

        g.R(72, 3, 42, 13, ScenePalette.B("#0B0F1C")); // TV de parede
        g.R(70, 2, 46, 1, ScenePalette.N3);
        g.R(112, 14, 1, 1, ScenePalette.Or);

        g.R(74, 20, 40, 1, ScenePalette.N4); // estante de troféus (ouro = glória)
        g.R(80, 16, 3, 4, ScenePalette.Gold);
        g.R(80, 15, 3, 1, ScenePalette.Gold6);
        g.R(90, 16, 3, 4, ScenePalette.Gold);
        g.R(100, 15, 3, 5, ScenePalette.Gold);
        g.R(100, 14, 3, 1, ScenePalette.Gold6);

        g.R(112, 15, 4, 7, ScenePalette.F7); // planta
        g.R(111, 13, 6, 3, ScenePalette.F5);
        g.R(113, 20, 2, 3, ScenePalette.Clay6);

        g.R(10, 24, 40, 2, ScenePalette.Clay7); // tapete
    }

    // ================= VÉSPERA — o vestiário (pré × pós-jogo) =================
    private static void DrawVespera(PixelCanvas g, SceneKey key)
    {
        Brush kitPrimary = ScenePalette.Or; // fatia 1: kit neutro — as cores do clube são a fatia 2
        Brush kitSecondary = ScenePalette.Chalk;
        Brush boot = ScenePalette.B("#16110D");

        g.R(0, 0, 120, 28, ScenePalette.B("#0E1524"));
        g.R(0, 0, 120, 8, ScenePalette.B("#0C1220")); // arquibancada + torcida (máscara determinística)
        for (int y = 1; y < 7; y++)
            for (int x = 0; x < 120; x += 2)
                if ((x + y * 3) % 5 < 2)
                    g.P(x + y % 2, y, x % 17 == 0 ? ScenePalette.DawnWarm2 : ScenePalette.N5);

        g.R(14, 0, 1, 7, ScenePalette.N6); // refletores
        g.R(12, 0, 4, 2, ScenePalette.B("#6E5A52"));
        g.R(13, 0, 1, 1, ScenePalette.DawnWarm2);
        g.R(104, 0, 1, 7, ScenePalette.N6);
        g.R(102, 0, 4, 2, ScenePalette.B("#6E5A52"));
        g.R(105, 0, 1, 1, ScenePalette.DawnWarm2);

        g.R(0, 8, 120, 3, ScenePalette.N3); // placas de publicidade
        for (int x = 2; x < 118; x += 10)
            g.R(x, 9, 6, 1, ScenePalette.N5);

        g.R(0, 11, 120, 2, ScenePalette.F7); // faixa de gramado
        for (int x = 0; x < 120; x++)
            if (x % 14 == 0)
                g.R(x, 11, 1, 2, ScenePalette.B("#256B39"));

        g.R(0, 13, 120, 15, ScenePalette.N2); // parede do vestiário
        g.R(0, 13, 120, 1, ScenePalette.N1);

        g.R(0, 23, 120, 3, ScenePalette.Wood); // banco
        g.R(0, 23, 120, 1, ScenePalette.B("#6B4A2A"));
        g.R(10, 26, 1, 2, ScenePalette.Wood2);
        g.R(60, 26, 1, 2, ScenePalette.Wood2);
        g.R(108, 26, 1, 2, ScenePalette.Wood2);

        g.R(98, 14, 20, 10, ScenePalette.B("#0B0F1C")); // prancheta tática
        g.R(97, 13, 22, 1, ScenePalette.N3);
        for (int x = 100; x < 116; x++)
            if (x % 4 == 0)
                g.P(x, 19, ScenePalette.Chalk);
        g.P(104, 16, ScenePalette.Chalk);
        g.P(108, 17, ScenePalette.Chalk);
        g.P(112, 16, ScenePalette.Chalk);
        g.R(103, 17, 7, 1, ScenePalette.Or);
        g.R(109, 16, 1, 3, ScenePalette.Or);

        g.R(70, 19, 22, 5, ScenePalette.N4); // mala do kit
        g.R(70, 19, 22, 1, ScenePalette.N5);
        g.R(72, 21, 18, 1, ScenePalette.B("#151C30"));

        if (!key.Played)
        {
            // PRÉ-JOGO: a camisa pendurada no gancho, chuteiras limpas.
            g.R(30, 13, 1, 2, ScenePalette.N6);
            g.R(31, 13, 3, 1, ScenePalette.N6);
            g.R(24, 15, 16, 8, kitPrimary);
            g.R(21, 15, 3, 3, kitPrimary);
            g.R(37, 15, 3, 3, kitPrimary);
            g.R(28, 15, 8, 1, kitSecondary);
            g.Num(30, 17, key.ShirtNumber.ToString(), kitSecondary);
            g.R(48, 21, 7, 3, boot);
            g.R(48, 21, 7, 1, ScenePalette.Or);
            g.R(57, 21, 7, 3, boot);
            g.R(57, 21, 7, 1, ScenePalette.Or);
        }
        else
        {
            // PÓS-JOGO: camisa jogada na banca, chuteiras enlameadas, placar aceso.
            g.R(22, 20, 20, 4, kitPrimary);
            g.R(22, 19, 20, 1, kitPrimary);
            g.R(24, 20, 6, 1, kitSecondary);

            g.R(48, 21, 7, 3, boot);
            g.P(50, 22, ScenePalette.Clay6);
            g.P(52, 23, ScenePalette.Clay5);
            g.R(57, 21, 7, 3, boot);
            g.P(59, 22, ScenePalette.Clay6);

            DrawScoreboard(g, key);
        }
    }

    /// O placar aceso. ⚠️ O handoff o desenha nas linhas 2-9 — ACIMA da faixa segura que ele
    /// próprio define, então ele sumiria por completo na altura de 64. Aqui vai para as linhas
    /// 14-21, dentro das 16 de baixo, e é desenhado por último (fica à frente da camisa).
    private static void DrawScoreboard(PixelCanvas g, SceneKey key)
    {
        Brush col =
            key.GoalsFor > key.GoalsAgainst ? ScenePalette.Win
            : key.GoalsFor < key.GoalsAgainst ? ScenePalette.Loss
            : ScenePalette.Draw;

        g.R(2, 14, 34, 8, ScenePalette.B("#0B0F1C"));
        g.R(2, 14, 34, 1, col);
        g.Num(5, 16, key.GoalsFor.ToString(), col);
        g.R(13, 18, 2, 1, ScenePalette.Ink3); // o "×"
        g.Num(18, 16, key.GoalsAgainst.ToString(), col);
        g.R(24, 16, 8, 1, col); // brilho embaixo
    }
}
