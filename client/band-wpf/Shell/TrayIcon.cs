using System.Runtime.InteropServices;
using BandClient.Shell.Interop;

namespace BandClient.Shell;

/// <summary>
/// Ícone da bandeja do sistema (systray) — o controle "roda em segundo plano" da faixa: o processo
/// segue vivo (poll/presença), a janela apenas some/aparece. Via Shell_NotifyIcon (P/Invoke, zero
/// dependência). A janela dona recebe `WM_TRAYICON` no WndProc: clique esquerdo → mostra/oculta;
/// clique direito → menu (Mostrar/Ocultar · Sair). Política de UI (OP-17). Ícone genérico do sistema
/// por enquanto — o de marca (o bode) é asset de design futuro.
/// </summary>
internal sealed class TrayIcon
{
    public const uint CmdToggle = 1;
    public const uint CmdQuit = 2;
    private const uint IconId = 1;

    private readonly IntPtr _hwnd;
    private bool _added;

    public TrayIcon(IntPtr hwnd) => _hwnd = hwnd;

    public void Add(string tip)
    {
        NOTIFYICONDATA data = Build();
        data.uFlags = Win.NIF_MESSAGE | Win.NIF_ICON | Win.NIF_TIP;
        data.uCallbackMessage = unchecked((uint)Win.WM_TRAYICON);
        data.hIcon = NativeMethods.LoadIcon(IntPtr.Zero, Win.IDI_APPLICATION);
        data.szTip = tip;
        _added = NativeMethods.Shell_NotifyIcon(Win.NIM_ADD, ref data);
    }

    public void Remove()
    {
        if (!_added)
            return;
        NOTIFYICONDATA data = Build();
        NativeMethods.Shell_NotifyIcon(Win.NIM_DELETE, ref data);
        _added = false;
    }

    /// <summary>Mostra o menu do tray no cursor e devolve o comando (0 = nada). SetForegroundWindow +
    /// PostMessage(WM_NULL) é o idioma clássico p/ o menu dispensar direito numa janela NOACTIVATE.</summary>
    public uint ShowMenu(bool visible)
    {
        NativeMethods.SetForegroundWindow(_hwnd);
        IntPtr menu = NativeMethods.CreatePopupMenu();
        NativeMethods.AppendMenu(menu, Win.MF_STRING, CmdToggle, visible ? "Ocultar" : "Mostrar");
        NativeMethods.AppendMenu(menu, Win.MF_SEPARATOR, 0, string.Empty);
        NativeMethods.AppendMenu(menu, Win.MF_STRING, CmdQuit, "Sair");
        NativeMethods.GetCursorPos(out POINT pt);
        uint cmd = NativeMethods.TrackPopupMenuEx(
            menu,
            Win.TPM_RIGHTBUTTON | Win.TPM_RETURNCMD | Win.TPM_NONOTIFY,
            pt.X,
            pt.Y,
            _hwnd,
            IntPtr.Zero
        );
        NativeMethods.DestroyMenu(menu);
        NativeMethods.PostMessage(_hwnd, unchecked((uint)Win.WM_NULL), IntPtr.Zero, IntPtr.Zero);
        return cmd;
    }

    private NOTIFYICONDATA Build() =>
        new()
        {
            cbSize = (uint)Marshal.SizeOf<NOTIFYICONDATA>(),
            hWnd = _hwnd,
            uID = IconId,
            // ByValTStr não aceita null no marshal — inicializa todas as strings.
            szTip = string.Empty,
            szInfo = string.Empty,
            szInfoTitle = string.Empty,
        };
}
