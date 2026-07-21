using System.Runtime.InteropServices;

namespace BandClient.Shell.Interop;

// Portado verbatim do spike widget-taskbar (SPEC-006 → SPEC-042). Só windowing/shell/DWM (OP-17).

[StructLayout(LayoutKind.Sequential)]
internal struct RECT
{
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;

    public int Width => Right - Left;
    public int Height => Bottom - Top;

    public override string ToString() => $"[{Left},{Top} {Width}x{Height}]";
}

[StructLayout(LayoutKind.Sequential)]
internal struct APPBARDATA
{
    public uint cbSize;
    public IntPtr hWnd;
    public uint uCallbackMessage;
    public uint uEdge;
    public RECT rc;
    public IntPtr lParam;
}

[StructLayout(LayoutKind.Sequential)]
internal struct MONITORINFO
{
    public uint cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
}

/// <summary>Constantes Win32 usadas pelo shell (política de UI — OP-17, zero regra de jogo).</summary>
internal static class Win
{
    // SHAppBarMessage (dwMessage) — só GETTASKBARPOS é usado (a faixa não reserva borda, Postura A).
    public const uint ABM_GETTASKBARPOS = 0x00000005;

    // Estilos estendidos
    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_TOPMOST = 0x00000008;
    public const int WS_EX_NOACTIVATE = 0x08000000;

    // SetWindowPos
    public static readonly IntPtr HWND_TOPMOST = new(-1);
    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOACTIVATE = 0x0010;

    // MonitorFromWindow
    public const uint MONITOR_DEFAULTTONEAREST = 0x00000002;

    // DWM (Win+D / show-desktop cloaking — só detecção, o fix WorkerW é deferido na SPEC-042)
    public const int DWMWA_CLOAKED = 14;

    // SetWinEventHook (reposicionar por evento, não por polling — <1% CPU)
    public const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
    public const uint WINEVENT_OUTOFCONTEXT = 0x0000;

    // SHQueryUserNotificationState (silêncio sobre fullscreen — reusa achado da SPEC-005)
    public const int QUNS_RUNNING_D3D_FULL_SCREEN = 3;
    public const int QUNS_PRESENTATION_MODE = 4;
}
