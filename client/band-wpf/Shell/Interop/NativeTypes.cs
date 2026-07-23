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

[StructLayout(LayoutKind.Sequential)]
internal struct POINT
{
    public int X;
    public int Y;
}

/// <summary>Dados do ícone da bandeja (ocultar/mostrar a faixa). Struct MODERNA COMPLETA
/// (NOTIFYICONDATAW): o `cbSize` precisa bater com uma versão que o Windows reconhece, senão
/// `Shell_NotifyIcon` falha em silêncio. Por isso todos os campos, mesmo os que não usamos.</summary>
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
internal struct NOTIFYICONDATA
{
    public uint cbSize;
    public IntPtr hWnd;
    public uint uID;
    public uint uFlags;
    public uint uCallbackMessage;
    public IntPtr hIcon;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string szTip;

    public uint dwState;
    public uint dwStateMask;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string szInfo;

    public uint uVersion;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
    public string szInfoTitle;

    public uint dwInfoFlags;
    public Guid guidItem;
    public IntPtr hBalloonIcon;
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

    // Shell_NotifyIcon — o ícone da bandeja (ocultar/mostrar a faixa; o processo segue rodando).
    public const uint NIM_ADD = 0x00000000;
    public const uint NIM_MODIFY = 0x00000001;
    public const uint NIM_DELETE = 0x00000002;
    public const uint NIF_MESSAGE = 0x00000001;
    public const uint NIF_ICON = 0x00000002;
    public const uint NIF_TIP = 0x00000004;

    // Mensagem de callback do ícone (WM_APP + 1) e os cliques que chegam no lParam.
    public const int WM_TRAYICON = 0x8000 + 1; // WM_APP + 1
    public const int WM_NULL = 0x0000;
    public const int WM_LBUTTONUP = 0x0202;
    public const int WM_RBUTTONUP = 0x0205;

    // Menu de contexto nativo do tray (TrackPopupMenuEx é o padrão robusto p/ janela NOACTIVATE).
    public const uint MF_STRING = 0x00000000;
    public const uint MF_SEPARATOR = 0x00000800;
    public const uint TPM_RIGHTBUTTON = 0x0002;
    public const uint TPM_RETURNCMD = 0x0100;
    public const uint TPM_NONOTIFY = 0x0080;

    // LoadIcon — ícone genérico do sistema (o ícone de marca é asset de design futuro).
    public static readonly IntPtr IDI_APPLICATION = new(32512);
}
