using System.Runtime.InteropServices;
using BandClient.Shell.Interop;

namespace BandClient.Shell;

/// <summary>
/// Calcula o retângulo (px físico) da faixa compacta ancorada à taskbar, para a Postura A
/// (topmost). `ABM_GETTASKBARPOS` dá a taskbar do sistema; `GetMonitorInfo(rcWork)` dá a área
/// útil (já sem a taskbar) do monitor da janela. Política de UI (OP-17). Portado do spike SPEC-006.
/// </summary>
internal static class TaskbarAnchor
{
    public enum Edge
    {
        Left,
        Top,
        Right,
        Bottom,
        Unknown,
    }

    public readonly record struct Anchor(RECT Taskbar, RECT Monitor, RECT Work, Edge Edge, RECT Band);

    /// <summary>Retângulo da taskbar do sistema (só a primária — caveat multi-monitor no RESULTS).</summary>
    public static RECT GetTaskbarRect()
    {
        var data = new APPBARDATA { cbSize = (uint)Marshal.SizeOf<APPBARDATA>() };
        NativeMethods.SHAppBarMessage(Win.ABM_GETTASKBARPOS, ref data);
        return data.rc;
    }

    public static Anchor Compute(IntPtr hwnd, int bandWidth, int bandHeight)
    {
        MONITORINFO mi = MonitorOf(hwnd);
        RECT taskbar = GetTaskbarRect();
        Edge edge = EdgeOf(taskbar, mi.rcMonitor);
        RECT band = BandRect(mi.rcWork, edge, bandWidth, bandHeight);
        return new Anchor(taskbar, mi.rcMonitor, mi.rcWork, edge, band);
    }

    private static MONITORINFO MonitorOf(IntPtr hwnd)
    {
        IntPtr mon = NativeMethods.MonitorFromWindow(hwnd, Win.MONITOR_DEFAULTTONEAREST);
        var mi = new MONITORINFO { cbSize = (uint)Marshal.SizeOf<MONITORINFO>() };
        NativeMethods.GetMonitorInfo(mon, ref mi);
        return mi;
    }

    // Borda ocupada pela taskbar = onde a taskbar encosta na borda do monitor.
    private static Edge EdgeOf(RECT tb, RECT mon)
    {
        if (tb.Right - tb.Left == 0 && tb.Bottom - tb.Top == 0)
            return Edge.Bottom; // fallback
        if (tb.Width >= tb.Height)
            return tb.Top <= mon.Top ? Edge.Top : Edge.Bottom;
        return tb.Left <= mon.Left ? Edge.Left : Edge.Right;
    }

    // Faixa compacta encostada no canto da área útil, junto à taskbar (não reserva espaço).
    private static RECT BandRect(RECT work, Edge edge, int w, int h) =>
        edge switch
        {
            Edge.Top => Make(work.Right - w, work.Top, w, h),
            Edge.Left => Make(work.Left, work.Bottom - h, w, h),
            _ => Make(work.Right - w, work.Bottom - h, w, h), // Bottom/Right/Unknown
        };

    private static RECT Make(int x, int y, int w, int h) =>
        new()
        {
            Left = x,
            Top = y,
            Right = x + w,
            Bottom = y + h,
        };
}
