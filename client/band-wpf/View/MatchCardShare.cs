using System.IO;
using System.Windows;
using System.Windows.Media.Imaging;

namespace BandClient.View;

/// <summary>O gesto de compartilhar o card (SPEC-049): renderiza o PNG 1080×1080, salva em
/// `Pictures\NextGoat` (a fonte-da-verdade) e copia a imagem p/ a área de transferência (colar no
/// WhatsApp). Best-effort — nunca lança; devolve o feedback p/ a faixa. Roda na UI thread (o render usa
/// objetos WPF); é chamado do handler de clique.</summary>
internal static class MatchCardShare
{
    private static readonly MatchCardRenderer Renderer = new();

    public static string Share(MatchCardModel model)
    {
        BitmapSource card;
        try
        {
            card = Renderer.Render(model);
        }
        catch
        {
            // OP-11 no cliente: sem detalhe interno na faixa; só o render que falha é "não deu p/ gerar".
            return "não deu para gerar o card";
        }

        // Os dois destinos são best-effort INDEPENDENTES: um erro de disco (pasta não-gravável) não pode
        // custar o clipboard — a via PRIMÁRIA (colar no WhatsApp). A mensagem reflete o que de fato deu.
        bool copied = TrySetClipboard(card);
        bool saved = TrySave(card, model);
        if (copied)
            return "card copiado ✓ (cole no WhatsApp)";
        if (saved)
            return @"card salvo em Pictures\NextGoat";
        return "não deu para gerar o card";
    }

    private static bool TrySave(BitmapSource card, MatchCardModel model)
    {
        try
        {
            Save(card, model);
            return true;
        }
        catch
        {
            return false; // IO/pasta não-gravável não deve derrubar a cópia p/ o clipboard
        }
    }

    private static void Save(BitmapSource card, MatchCardModel model)
    {
        string dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyPictures),
            "NextGoat"
        );
        Directory.CreateDirectory(dir);
        string file = Path.Combine(dir, $"card-s{model.SeasonNumber}-r{model.Round}.png");
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(card));
        using FileStream fs = File.Create(file);
        encoder.Save(fs);
    }

    // O clipboard é conveniência (o PNG salvo é a fonte-da-verdade). SetImage pode lançar se outro
    // processo tranca o clipboard → não perde o save.
    private static bool TrySetClipboard(BitmapSource card)
    {
        try
        {
            Clipboard.SetImage(card);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
