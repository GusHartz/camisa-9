using System.Threading;
using System.Windows;

namespace WidgetTaskbar;

/// <summary>Postura de ancoragem da faixa à taskbar (SPEC-006, comparação do spike).</summary>
public enum Posture
{
    /// <summary>A — janela topmost borderless, flutua junto à taskbar (ambiente, coberta por maximizado).</summary>
    Topmost,

    /// <summary>B — AppBar (SHAppBarMessage), reserva a borda (robusta, "segunda taskbar").</summary>
    AppBar,
}

public partial class App : Application
{
    private static Mutex? _single;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        ShutdownMode = ShutdownMode.OnMainWindowClose;

        _single = new Mutex(true, "camisa9-widget-taskbar-single", out bool isNew);
        if (!isNew) { Shutdown(); return; }

        new MainWindow(ParsePosture(e.Args)).Show();
    }

    // Flag --posture=appbar|topmost (default: topmost). Sem lógica de jogo (OP-17).
    private static Posture ParsePosture(IEnumerable<string> args)
    {
        const string flag = "--posture=";
        foreach (string a in args)
        {
            if (!a.StartsWith(flag, StringComparison.OrdinalIgnoreCase)) continue;
            string v = a[flag.Length..];
            return v.Equals("appbar", StringComparison.OrdinalIgnoreCase) ? Posture.AppBar : Posture.Topmost;
        }
        return Posture.Topmost;
    }
}
