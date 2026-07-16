using System.Runtime.InteropServices;
using WidgetTaskbar.Interop;

namespace WidgetTaskbar;

/// <summary>
/// Postura B — AppBar (SHAppBarMessage). Reserva a borda inferior (nada sobrepõe).
/// Sequência: ABM_NEW → ABM_QUERYPOS → ABM_SETPOS; ABM_REMOVE no exit (senão VAZA a
/// reserva de borda). A espessura (px físico) vem por-chamada para escalar com o DPI.
/// O callback ABN_* é tratado pelo wndproc da MainWindow. OP-17.
/// </summary>
internal sealed class AppBarHost
{
    private readonly IntPtr _hwnd;
    private bool _registered;

    public uint CallbackMessage { get; }

    public AppBarHost(IntPtr hwnd, uint callbackMessage)
    {
        _hwnd = hwnd;
        CallbackMessage = callbackMessage;
    }

    /// <summary>ABM_NEW + primeiro posicionamento. Retorna o rc final reservado.</summary>
    public RECT Register(int thickness)
    {
        APPBARDATA data = New();
        NativeMethods.SHAppBarMessage(Win.ABM_NEW, ref data);
        _registered = true;
        return SetPos(thickness);
    }

    /// <summary>ABM_QUERYPOS → ABM_SETPOS (chamar em ABN_POSCHANGED / mudança de tela/DPI).</summary>
    public RECT SetPos(int thickness)
    {
        RECT mon = MonitorRect();
        APPBARDATA data = New();
        data.uEdge = Win.ABE_BOTTOM;
        data.rc = new RECT { Left = mon.Left, Top = mon.Bottom - thickness, Right = mon.Right, Bottom = mon.Bottom };
        NativeMethods.SHAppBarMessage(Win.ABM_QUERYPOS, ref data);
        // O sistema empurra o rc para cima da taskbar; fixa a espessura na base ajustada.
        data.rc.Top = data.rc.Bottom - thickness;
        NativeMethods.SHAppBarMessage(Win.ABM_SETPOS, ref data);
        return data.rc;
    }

    /// <summary>ABM_REMOVE — libera a borda reservada. Idempotente.</summary>
    public void Remove()
    {
        if (!_registered) return;
        APPBARDATA data = New();
        NativeMethods.SHAppBarMessage(Win.ABM_REMOVE, ref data);
        _registered = false;
    }

    private RECT MonitorRect()
    {
        IntPtr mon = NativeMethods.MonitorFromWindow(_hwnd, Win.MONITOR_DEFAULTTONEAREST);
        var mi = new MONITORINFO { cbSize = (uint)Marshal.SizeOf<MONITORINFO>() };
        NativeMethods.GetMonitorInfo(mon, ref mi);
        return mi.rcMonitor;
    }

    private APPBARDATA New() => new()
    {
        cbSize = (uint)Marshal.SizeOf<APPBARDATA>(),
        hWnd = _hwnd,
        uCallbackMessage = CallbackMessage,
    };
}
