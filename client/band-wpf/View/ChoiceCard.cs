using System.Collections.Generic;
using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using BandClient.Api;

namespace BandClient.View;

/// <summary>
/// O DESENHO do momento de escolha (SPEC-051) — fiel ao handoff do Claude Design, tratamento 1a
/// ("aposta acesa"). Só apresentação: recebe o que o servidor mandou e devolve a árvore visual;
/// nenhuma regra de jogo mora aqui (OP-17) — o `result` chega pronto, a chance do roll nunca vem.
///
/// Medidas/cores do handoff (tokens do design system Next Goat):
///   popup 462 · surface-raised #1B2440 · hairline #FFFFFF14 · topo 2px accent #E8722A
///   header "NO LANCE" Pixelify 9 tracking .06em · minuto Silkscreen 10 #6B769A
///   prompt Pixelify 15 CAIXA ALTA #EAF0FF · opção segura #232F52 borda #3D4E80 + selo GARANTIDO
///   opção arriscada #E8722A texto #2A1405 + chip ⚡ATTR (#E8722A sobre branco) + micro-texto
///   glória: topo #E8C168, headline ouro com sombra dura #A87E2C · fracasso: topo #5A648A (SEM vermelho)
/// </summary>
public static class ChoiceCard
{
    private const double CardWidth = 462;

    private static readonly Brush Surface = Frozen(0x1B, 0x24, 0x40); // --surface-raised
    private static readonly Brush SurfaceCard = Frozen(0x23, 0x2F, 0x52); // --surface-card
    private static readonly Brush Hairline = Frozen(0xFF, 0xFF, 0xFF, 0x14); // --border-hairline
    private static readonly Brush BorderStrong = Frozen(0x3D, 0x4E, 0x80); // --border-strong
    private static readonly Brush Accent = Frozen(0xE8, 0x72, 0x2A); // --accent
    private static readonly Brush OnAccent = Frozen(0x2A, 0x14, 0x05); // --text-on-accent
    private static readonly Brush OnAccentSoft = Frozen(0x2A, 0x14, 0x05, 0xB8); // 72%
    private static readonly Brush TextPrimary = Frozen(0xEA, 0xF0, 0xFF); // --text-primary
    private static readonly Brush TextSecondary = Frozen(0xA9, 0xB4, 0xD0); // --text-secondary
    private static readonly Brush TextMuted = Frozen(0x6B, 0x76, 0x9A); // --text-muted
    private static readonly Brush Draw = Frozen(0x8A, 0x93, 0xB4); // --draw-500
    private static readonly Brush DrawDeep = Frozen(0x5A, 0x64, 0x8A); // --draw-700
    private static readonly Brush Gold = Frozen(0xE8, 0xC1, 0x68); // --gold-500 (GLÓRIA)
    private static readonly Brush GoldDeep = Frozen(0xA8, 0x7E, 0x2C); // --gold-700
    private static readonly Brush ChipTrack = Frozen(0xFF, 0xFF, 0xFF, 0x0F); // rgba(255,255,255,.06)
    private static readonly Brush White = Frozen(0xFF, 0xFF, 0xFF);

    // As MESMAS famílias embarcadas do card de partida (SPEC-049) — OFL, `Resource` no exe.
    private static readonly FontFamily Display =
        new(new System.Uri("pack://application:,,,/"), "./Assets/fonts/#Pixelify Sans");
    private static readonly FontFamily Numeric =
        new(new System.Uri("pack://application:,,,/"), "./Assets/fonts/#Silkscreen");
    private static readonly FontFamily Ui = new("Segoe UI");

    /// <summary>O momento ABERTO (estado ①): header + prompt + as 2 opções. `onOptionClick` recebe a
    /// linha da opção no `DataContext` (o code-behind dispara o POST).</summary>
    public static UIElement BuildOffer(
        BandMatchChoice choice,
        IReadOnlyList<ChoiceOptionRow> options,
        MouseButtonEventHandler onOptionClick
    )
    {
        StackPanel body = new() { Margin = new Thickness(12, 10, 12, 12) };
        // O prompt cai p/ 14px quando é longo (estado ⑤) — o popup cresce ~20px, não mais.
        bool longPrompt = (choice.Prompt ?? "").Length > 46;
        body.Children.Add(
            new TextBlock
            {
                Text = (choice.Prompt ?? "").ToUpperInvariant(),
                FontFamily = Display,
                FontSize = longPrompt ? 14 : 15,
                LineHeight = longPrompt ? 17 : 18,
                Foreground = TextPrimary,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 10),
            }
        );

        Grid row = new();
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        for (int i = 0; i < options.Count && i < 2; i++)
        {
            UIElement btn = OptionButton(options[i], onOptionClick);
            Grid.SetColumn((FrameworkElement)btn, i == 0 ? 0 : 2);
            row.Children.Add(btn);
        }
        body.Children.Add(row);

        return Shell(Accent, Header("NO LANCE", Accent, choice.Minute), body);
    }

    /// <summary>O DESFECHO (estados ③/④): glória em ouro, "foi assim" em slate — nunca vermelho.
    /// `title`/`body` vêm do catálogo (servidor); ausentes → feedback genérico.</summary>
    public static UIElement BuildOutcome(
        int minute,
        string result,
        string? title,
        string? body,
        int? moralDelta
    )
    {
        bool glory = result == "success";
        Brush edge = glory ? Gold : DrawDeep;
        Brush label = glory ? Gold : Draw;

        Grid content = new() { Margin = new Thickness(12) };
        content.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        content.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        content.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        // ⚠️ o sprite `goat-celebrate.png` do handoff ainda não está no repo (ver DONE-051): a glória
        // usa o `goat-idle` em opacidade cheia; o fracasso, a 85% — como o handoff pede no ④.
        Image sprite =
            new()
            {
                Source = CardDraw.Goat,
                Height = glory ? 52 : 50,
                Stretch = Stretch.Uniform,
                Opacity = glory ? 1.0 : 0.85,
                Margin = new Thickness(0, 0, 12, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };
        RenderOptions.SetBitmapScalingMode(sprite, BitmapScalingMode.NearestNeighbor);
        if (glory)
            Pop(sprite);
        Grid.SetColumn(sprite, 0);
        content.Children.Add(sprite);

        StackPanel texts = new() { VerticalAlignment = VerticalAlignment.Center };
        TextBlock head = new()
        {
            Text = (title ?? (glory ? "Deu bom!" : "Foi assim.")).ToUpperInvariant(),
            FontFamily = Display,
            FontSize = glory ? 16 : 15,
            Foreground = glory ? Gold : TextPrimary,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 0, 0, 4),
        };
        if (glory)
            head.Effect = null; // sombra dura vem do texto-fantasma abaixo (WPF não tem text-shadow)
        texts.Children.Add(glory ? HardShadow(head, GoldDeep) : head);
        if (!string.IsNullOrEmpty(body))
        {
            texts.Children.Add(
                new TextBlock
                {
                    Text = body,
                    FontFamily = Ui,
                    FontSize = 12,
                    LineHeight = 17,
                    Foreground = TextSecondary,
                    TextWrapping = TextWrapping.Wrap,
                }
            );
        }
        Grid.SetColumn(texts, 1);
        content.Children.Add(texts);

        if (moralDelta is { } delta && delta != 0)
        {
            StackPanel col =
                new()
                {
                    Margin = new Thickness(10, 0, 0, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                };
            col.Children.Add(Micro("MORAL", TextMuted, 7));
            col.Children.Add(
                new TextBlock
                {
                    Text = (delta > 0 ? "+" : "") + delta.ToString(CultureInfo.InvariantCulture),
                    FontFamily = Numeric,
                    FontSize = 15,
                    Foreground = delta > 0 ? Gold : Draw,
                    HorizontalAlignment = HorizontalAlignment.Center,
                }
            );
            Grid.SetColumn(col, 2);
            content.Children.Add(col);
        }

        return Shell(edge, Header(glory ? "GLÓRIA" : "FOI ASSIM", label, minute), content);
    }

    /// <summary>A moldura comum: 462 de largura, topo 2px na cor do estado, header + corpo. A
    /// entrada é one-shot (opacidade + 8px em 320ms) — nada contínuo (orçamento &lt;1% CPU).</summary>
    private static UIElement Shell(Brush edge, UIElement header, UIElement body)
    {
        StackPanel stack = new();
        stack.Children.Add(header);
        stack.Children.Add(body);

        Border card =
            new()
            {
                Width = CardWidth,
                Background = Surface,
                BorderBrush = Hairline,
                BorderThickness = new Thickness(1, 0, 1, 1),
                CornerRadius = new CornerRadius(4, 4, 0, 0),
                Child = stack,
            };
        Border top =
            new()
            {
                Background = edge,
                Height = 2,
                CornerRadius = new CornerRadius(4, 4, 0, 0),
            };
        StackPanel outer = new() { Width = CardWidth };
        outer.Children.Add(top);
        outer.Children.Add(card);
        Rise(outer);
        return outer;
    }

    private static UIElement Header(string label, Brush labelBrush, int minute)
    {
        Grid g = new() { Margin = new Thickness(12, 6, 12, 6) };
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        TextBlock l = Micro(label, labelBrush, 9);
        Grid.SetColumn(l, 0);
        g.Children.Add(l);
        TextBlock m =
            new()
            {
                Text = minute + "'",
                FontFamily = Numeric,
                FontSize = 10,
                Foreground = TextMuted,
                VerticalAlignment = VerticalAlignment.Center,
            };
        Grid.SetColumn(m, 1);
        g.Children.Add(m);
        return new Border
        {
            BorderBrush = Hairline,
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = g,
        };
    }

    /// <summary>Uma opção: segura = neutra com selo GARANTIDO; arriscada = laranja sólido com o chip
    /// ⚡ATTR e o micro-texto. Três sinais somados marcam a aposta (cor + chip + texto), nunca %.</summary>
    private static UIElement OptionButton(ChoiceOptionRow row, MouseButtonEventHandler onClick)
    {
        StackPanel inner = new();
        inner.Children.Add(
            new TextBlock
            {
                Text = row.Label,
                FontFamily = Ui,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                LineHeight = 16,
                Foreground = row.Risky ? OnAccent : TextPrimary,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 6),
            }
        );

        if (row.Risky)
        {
            StackPanel tag = new() { Orientation = Orientation.Horizontal };
            tag.Children.Add(Chip("⚡ " + row.Attr, Accent, White));
            tag.Children.Add(
                new TextBlock
                {
                    Text = row.Hint,
                    FontFamily = Ui,
                    FontSize = 9,
                    Foreground = OnAccentSoft,
                    Margin = new Thickness(6, 0, 0, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                }
            );
            inner.Children.Add(tag);
        }
        else
        {
            StackPanel wrap = new() { Orientation = Orientation.Horizontal };
            wrap.Children.Add(Chip("GARANTIDO", Draw, ChipTrack));
            inner.Children.Add(wrap);
        }

        Border b =
            new()
            {
                Background = row.Risky ? Accent : SurfaceCard,
                BorderBrush = row.Risky ? Accent : BorderStrong,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(11, 9, 11, 9),
                Cursor = Cursors.Hand,
                DataContext = row,
                Child = inner,
            };
        b.MouseLeftButtonDown += onClick;
        return b;
    }

    private static UIElement Chip(string text, Brush fg, Brush bg) =>
        new Border
        {
            Background = bg,
            CornerRadius = new CornerRadius(2),
            Padding = new Thickness(6, 2, 6, 2),
            HorizontalAlignment = HorizontalAlignment.Left,
            Child = Micro(text, fg, 8),
        };

    private static TextBlock Micro(string text, Brush fg, double size) =>
        new()
        {
            Text = text,
            FontFamily = Display,
            FontSize = size,
            Foreground = fg,
            VerticalAlignment = VerticalAlignment.Center,
        };

    /// <summary>Sombra DURA de 2px (o `text-shadow` do handoff) — WPF não a tem: duplica o texto
    /// deslocado atrás, dentro de um Grid. Nada de blur (custo de render).</summary>
    private static UIElement HardShadow(TextBlock front, Brush shadow)
    {
        TextBlock back =
            new()
            {
                Text = front.Text,
                FontFamily = front.FontFamily,
                FontSize = front.FontSize,
                Foreground = shadow,
                TextWrapping = front.TextWrapping,
                Margin = new Thickness(0, 2, 0, 0),
            };
        Grid g = new() { Margin = front.Margin };
        front.Margin = new Thickness(0);
        g.Children.Add(back);
        g.Children.Add(front);
        return g;
    }

    private static void Rise(UIElement el)
    {
        TranslateTransform t = new(0, 8);
        el.RenderTransform = t;
        el.Opacity = 0;
        el.BeginAnimation(UIElement.OpacityProperty, Anim(0, 1, 320));
        t.BeginAnimation(TranslateTransform.YProperty, Anim(8, 0, 320));
    }

    private static void Pop(UIElement el)
    {
        ScaleTransform s = new(0.6, 0.6);
        el.RenderTransformOrigin = new Point(0.5, 0.5);
        el.RenderTransform = s;
        s.BeginAnimation(ScaleTransform.ScaleXProperty, Anim(0.6, 1, 500, true));
        s.BeginAnimation(ScaleTransform.ScaleYProperty, Anim(0.6, 1, 500, true));
    }

    private static DoubleAnimation Anim(double from, double to, int ms, bool bounce = false) =>
        new(from, to, new Duration(System.TimeSpan.FromMilliseconds(ms)))
        {
            EasingFunction = bounce
                ? new BackEase { Amplitude = 0.5, EasingMode = EasingMode.EaseOut }
                : new CubicEase { EasingMode = EasingMode.EaseOut },
        };

    private static Brush Frozen(byte r, byte g, byte b, byte a = 0xFF)
    {
        SolidColorBrush br = new(Color.FromArgb(a, r, g, b));
        br.Freeze();
        return br;
    }
}
