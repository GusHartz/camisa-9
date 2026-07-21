using System.Runtime.InteropServices;
using BandClient.Shell.Interop;

namespace BandClient.Shell;

/// <summary>
/// Detecção de app em tela cheia para esconder a faixa (política de UI — OP-17).
/// Reusa o achado da SPEC-005: `SHQueryUserNotificationState` sozinho NÃO pega
/// borderless-fullscreen — então combina com checagem de geometria (a janela em
/// foreground cobre o monitor inteiro). Portado verbatim do spike SPEC-006.
/// </summary>
internal static class Fullscreen
{
    public static bool IsActive(IntPtr selfHwnd)
    {
        int hr = NativeMethods.SHQueryUserNotificationState(out int state);
        if (
            hr == 0
            && (state == Win.QUNS_RUNNING_D3D_FULL_SCREEN || state == Win.QUNS_PRESENTATION_MODE)
        )
            return true;

        IntPtr fg = NativeMethods.GetForegroundWindow();
        if (fg == IntPtr.Zero || fg == selfHwnd)
            return false;
        if (!NativeMethods.GetWindowRect(fg, out RECT wr))
            return false;
        return CoversMonitor(fg, wr);
    }

    private static bool CoversMonitor(IntPtr hwnd, RECT wr)
    {
        IntPtr mon = NativeMethods.MonitorFromWindow(hwnd, Win.MONITOR_DEFAULTTONEAREST);
        var mi = new MONITORINFO { cbSize = (uint)Marshal.SizeOf<MONITORINFO>() };
        if (!NativeMethods.GetMonitorInfo(mon, ref mi))
            return false;
        RECT m = mi.rcMonitor;
        return wr.Left <= m.Left && wr.Top <= m.Top && wr.Right >= m.Right && wr.Bottom >= m.Bottom;
    }
}
