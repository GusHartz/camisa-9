using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;

namespace FaixaSpike;

/// <summary>
/// Faixa always-on-bottom (SPEC-003, candidato A). A técnica:
///  - WS_EX_NOACTIVATE: a janela nunca rouba foco (você continua trabalhando).
///  - WS_EX_TOOLWINDOW: fora da taskbar e do Alt-Tab.
///  - Pin no fundo do Z-order: SetWindowPos(HWND_BOTTOM) + reafirmar em
///    WM_WINDOWPOSCHANGING toda vez que o SO tenta reordenar (foco, Win+D).
///  - Re-ancoragem em WM_DISPLAYCHANGE (multi-monitor / hotplug / reordenação).
/// A cena anima TranslateTransform.X (render thread, sem layout); o relógio é 1x/s por evento.
/// </summary>
public partial class MainWindow : Window
{
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TOOLWINDOW = 0x00000080;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private static readonly IntPtr HWND_BOTTOM = new(1);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOZORDER = 0x0004;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const int WM_WINDOWPOSCHANGING = 0x0046;
    private const int WM_DISPLAYCHANGE = 0x007E;

    private const int FaixaHeight = 40;

    private readonly DispatcherTimer _clock = new() { Interval = TimeSpan.FromSeconds(1) };

    public MainWindow()
    {
        InitializeComponent();
        Height = FaixaHeight;
        _clock.Tick += (_, _) => ClockText.Text = DateTime.Now.ToString("HH:mm:ss");
        SourceInitialized += OnSourceInitialized;
        Loaded += OnLoaded;
    }

    private void OnSourceInitialized(object? sender, EventArgs e)
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        int ex = GetWindowLong(hwnd, GWL_EXSTYLE);
        SetWindowLong(hwnd, GWL_EXSTYLE, ex | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
        HwndSource.FromHwnd(hwnd)?.AddHook(WndProc);
        SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }

    private void OnLoaded(object? sender, RoutedEventArgs e)
    {
        Anchor();
        ClockText.Text = DateTime.Now.ToString("HH:mm:ss");
        _clock.Start();
        StartScene();
    }

    /// <summary>Inicia o drift dos orbes. `To` = largura real + margem → cobre qualquer monitor.</summary>
    private void StartScene()
    {
        double to = Width + 60;
        AnimateOrb(Orb1T, to, seconds: 14, beginSeconds: 0);
        AnimateOrb(Orb2T, to, seconds: 19, beginSeconds: 3);
        AnimateOrb(Orb3T, to, seconds: 11, beginSeconds: 6);
        AnimateOrb(Orb4T, to, seconds: 23, beginSeconds: 1);
    }

    private static void AnimateOrb(TranslateTransform t, double to, double seconds, double beginSeconds)
    {
        // Anima TranslateTransform.X (render thread, sem layout) — não Canvas.Left.
        var anim = new DoubleAnimation(-60, to, new Duration(TimeSpan.FromSeconds(seconds)))
        {
            RepeatBehavior = RepeatBehavior.Forever,
            BeginTime = TimeSpan.FromSeconds(beginSeconds),
        };
        t.BeginAnimation(TranslateTransform.XProperty, anim);
    }

    /// <summary>Ancora na borda inferior da área de trabalho do primário, full-width.</summary>
    private void Anchor()
    {
        // SystemParameters.WorkArea (DIPs) já exclui a taskbar do monitor primário.
        var wa = SystemParameters.WorkArea;
        Left = wa.Left;
        Width = wa.Width;
        Top = wa.Bottom - Height;
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        switch (msg)
        {
            case WM_WINDOWPOSCHANGING:
                // Reafirma HWND_BOTTOM sempre que o SO tenta reordenar (foco, Win+D).
                var pos = Marshal.PtrToStructure<WINDOWPOS>(lParam);
                pos.hwndInsertAfter = HWND_BOTTOM;
                pos.flags &= ~SWP_NOZORDER; // permite reordenar → empurra p/ o fundo
                Marshal.StructureToPtr(pos, lParam, fDeleteOld: false);
                break;
            case WM_DISPLAYCHANGE:
                // Resolução/monitores mudaram (hotplug/reordenação) → re-ancora.
                Anchor();
                break;
        }
        return IntPtr.Zero;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WINDOWPOS
    {
        public IntPtr hwnd;
        public IntPtr hwndInsertAfter;
        public int x;
        public int y;
        public int cx;
        public int cy;
        public uint flags;
    }

    // GWL_EXSTYLE cabe em 32 bits — GetWindowLong/SetWindowLong servem em x64 p/ estilos.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(
        IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
