using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using WidgetTaskbar.Interop;

namespace WidgetTaskbar;

/// <summary>
/// Faixa compacta que ancora à taskbar em uma das duas posturas (SPEC-006). Coordena postura +
/// âncora + observador por-evento. Renderiza estado (postura/edge/rect/cloaked/fullscreen) para
/// o founder observar; NÃO tem regra de jogo (OP-17). Duplo-clique fecha (janela não-ativável).
/// Tamanhos em DIP, convertidos para px físico no anchor (SetWindowPos/ABM usam px físico).
/// </summary>
public partial class MainWindow : Window
{
    private const int BandWidthDip = 360;
    private const int BandHeightDip = 40;
    private const int AppBarThicknessDip = 40;
    private const uint AppBarCallback = 0x8000 + 1; // WM_APP + 1 (classe da janela é do WPF)
    private const int WM_SETTINGCHANGE = 0x001A;
    private const int WM_DISPLAYCHANGE = 0x007E;
    private const int WM_DPICHANGED = 0x02E0;

    private readonly Posture _posture;
    private readonly TaskbarWatcher _watcher = new();
    private IntPtr _hwnd;
    private AppBarHost? _appBar;
    private bool _appBarStarted;
    private bool _hidden;
    private bool _cleaned;
    private string _statusEdge = "?";
    private RECT _lastRect;

    public MainWindow(Posture posture)
    {
        _posture = posture;
        InitializeComponent();
        // Tamanho DIP inicial; o anchor físico (SetWindowPos) sobrescreve em seguida.
        Width = posture == Posture.AppBar ? 800 : BandWidthDip;
        Height = posture == Posture.AppBar ? AppBarThicknessDip : BandHeightDip;
        SourceInitialized += OnSourceInitialized;
        Loaded += (_, _) => StartAnimation();
        Closing += (_, _) => Cleanup();
    }

    private void OnSourceInitialized(object? sender, EventArgs e)
    {
        _hwnd = new WindowInteropHelper(this).Handle;
        HwndSource.FromHwnd(_hwnd)!.AddHook(WndProc);
        RegisterExitSafetyNets();

        if (_posture == Posture.Topmost)
        {
            TopmostStrip.Apply(_hwnd);
        }
        else
        {
            TopmostStrip.ApplyToolWindow(_hwnd); // fora do Alt-Tab / sem roubar foco (Cenário 2)
            _appBar = new AppBarHost(_hwnd, AppBarCallback);
        }

        ReAnchor();
        _watcher.ForegroundChanged += OnForegroundChanged;
        _watcher.Start();
    }

    // DIP → px físico pelo DPI do monitor atual (a geometria da taskbar é px físico, PerMonitorV2).
    private (int W, int H, int Thickness) Physical()
    {
        DpiScale dpi = VisualTreeHelper.GetDpi(this);
        return ((int)Math.Round(BandWidthDip * dpi.DpiScaleX),
                (int)Math.Round(BandHeightDip * dpi.DpiScaleY),
                (int)Math.Round(AppBarThicknessDip * dpi.DpiScaleY));
    }

    private void ReAnchor()
    {
        (int w, int h, int thickness) = Physical();
        if (_posture == Posture.AppBar)
        {
            RECT rc = _appBarStarted ? _appBar!.SetPos(thickness) : _appBar!.Register(thickness);
            _appBarStarted = true;
            MoveTo(rc, topmost: false);
            _statusEdge = "Bottom (AppBar)";
            _lastRect = rc;
        }
        else
        {
            TaskbarAnchor.Anchor a = TaskbarAnchor.Compute(_hwnd, w, h);
            MoveTo(a.Band, topmost: true);
            _statusEdge = a.Edge.ToString();
            _lastRect = a.Band;
        }
        UpdateStatus();
    }

    private void MoveTo(RECT r, bool topmost) =>
        NativeMethods.SetWindowPos(_hwnd, topmost ? Win.HWND_TOPMOST : IntPtr.Zero,
            r.Left, r.Top, r.Width, r.Height, Win.SWP_NOACTIVATE);

    // Troca de foreground: reafirma topmost (demote do 24H2), esconde+pausa sobre fullscreen.
    private void OnForegroundChanged()
    {
        if (_posture == Posture.Topmost) TopmostStrip.Reassert(_hwnd);
        bool fs = Fullscreen.IsActive(_hwnd);
        if (fs != _hidden)
        {
            _hidden = fs;
            Visibility = fs ? Visibility.Hidden : Visibility.Visible;
            if (fs) DotX.BeginAnimation(TranslateTransform.XProperty, null); // pausa: sem tick oculto
            else StartAnimation();
        }
        UpdateStatus();
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_DPICHANGED)
        {
            // Deferir: o handler de DPI do WPF roda depois e sobrescreveria um ReAnchor síncrono.
            Dispatcher.BeginInvoke(new Action(ReAnchor), DispatcherPriority.Background);
        }
        else if (msg is WM_DISPLAYCHANGE or WM_SETTINGCHANGE)
        {
            ReAnchor();
        }
        else if (_appBar != null && msg == (int)AppBarCallback)
        {
            int notify = wParam.ToInt32();
            if (notify is Win.ABN_POSCHANGED or Win.ABN_FULLSCREENAPP) ReAnchor();
        }
        return IntPtr.Zero;
    }

    private void StartAnimation()
    {
        double travel = Track.Width - Dot.Width;
        var anim = new DoubleAnimation(0, travel, new Duration(TimeSpan.FromSeconds(1.1)))
        {
            AutoReverse = true,
            RepeatBehavior = RepeatBehavior.Forever,
            EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut },
        };
        DotX.BeginAnimation(TranslateTransform.XProperty, anim);
    }

    private void UpdateStatus()
    {
        bool cloaked = TopmostStrip.IsCloaked(_hwnd);
        Status.Text =
            $"{_posture}  edge={_statusEdge}  {_lastRect}  " +
            $"Win+D-cloaked={(cloaked ? "SIM" : "não")}  fullscreen={(_hidden ? "SIM" : "não")}";
    }

    // ABM_REMOVE / unhook. Idempotente. Chamado por Closing e pelas redes de segurança.
    private void Cleanup()
    {
        if (_cleaned) return;
        _cleaned = true;
        _appBar?.Remove();
        _watcher.Dispose();
    }

    // TerminateProcess (Stop-Process -Force) NÃO é interceptável; estes cobrem os caminhos que são:
    // logoff/shutdown de sessão, exceção não tratada e saída normal do CLR.
    private void RegisterExitSafetyNets()
    {
        if (Application.Current is { } app)
        {
            app.SessionEnding += (_, _) => Cleanup();
            app.DispatcherUnhandledException += (_, _) => Cleanup();
        }
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Cleanup();
    }

    protected override void OnMouseDown(MouseButtonEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.ChangedButton == MouseButton.Left && e.ClickCount == 2) Close();
    }
}
