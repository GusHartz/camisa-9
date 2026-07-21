using BandClient.Shell.Interop;

namespace BandClient.Shell;

/// <summary>
/// Observa a mudança de janela em foreground por EVENTO (SetWinEventHook), não por polling —
/// crítico para o orçamento &lt;1% CPU (SPEC-006). Usa `EVENT_SYSTEM_FOREGROUND` para reafirmar
/// topmost (demote do 24H2), re-checar fullscreen e o cloak do Win+D. Mudanças de tela/DPI/taskbar
/// vão pelo wndproc. O callback OUTOFCONTEXT chega no thread que registrou o hook (a UI).
/// Portado verbatim do spike SPEC-006.
/// </summary>
internal sealed class TaskbarWatcher : IDisposable
{
    // Manter o delegate vivo: se o GC o coletar, o callback nativo aponta para lixo.
    private readonly NativeMethods.WinEventDelegate _callback;
    private IntPtr _hook;

    public event Action? ForegroundChanged;

    public TaskbarWatcher() => _callback = OnWinEvent;

    public void Start() =>
        _hook = NativeMethods.SetWinEventHook(
            Win.EVENT_SYSTEM_FOREGROUND,
            Win.EVENT_SYSTEM_FOREGROUND,
            IntPtr.Zero,
            _callback,
            0,
            0,
            Win.WINEVENT_OUTOFCONTEXT
        );

    private void OnWinEvent(
        IntPtr hook,
        uint ev,
        IntPtr hwnd,
        int idObject,
        int idChild,
        uint thread,
        uint time
    ) => ForegroundChanged?.Invoke();

    public void Dispose()
    {
        if (_hook != IntPtr.Zero)
            NativeMethods.UnhookWinEvent(_hook);
        _hook = IntPtr.Zero;
    }
}
