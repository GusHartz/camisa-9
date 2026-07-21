using BandClient.Shell.Interop;

namespace BandClient.Shell;

/// <summary>
/// Postura A — janela topmost borderless. Aplica os estilos estendidos no nível Win32
/// (não via propriedades WPF, que recriam o HWND e perdem estilo/topmost — bug do owner
/// oculto) e detecta o cloaking do Win+D. Política de UI (OP-17). Portado do spike SPEC-006.
/// </summary>
internal static class TopmostStrip
{
    /// <summary>WS_EX_NOACTIVATE|TOOLWINDOW — não rouba foco, fora do Alt-Tab.</summary>
    public static void ApplyToolWindow(IntPtr hwnd)
    {
        int ex = NativeMethods.GetWindowLong(hwnd, Win.GWL_EXSTYLE);
        ex |= Win.WS_EX_NOACTIVATE | Win.WS_EX_TOOLWINDOW;
        NativeMethods.SetWindowLong(hwnd, Win.GWL_EXSTYLE, ex);
    }

    /// <summary>Postura A: adiciona TOPMOST ao tool-window e reafirma (chamar em SourceInitialized).</summary>
    public static void Apply(IntPtr hwnd)
    {
        ApplyToolWindow(hwnd);
        int ex = NativeMethods.GetWindowLong(hwnd, Win.GWL_EXSTYLE);
        NativeMethods.SetWindowLong(hwnd, Win.GWL_EXSTYLE, ex | Win.WS_EX_TOPMOST);
        Reassert(hwnd);
    }

    /// <summary>Reafirma o topmost — contorna o demote do 24H2 e o owner oculto do WPF.</summary>
    public static void Reassert(IntPtr hwnd) =>
        NativeMethods.SetWindowPos(
            hwnd,
            Win.HWND_TOPMOST,
            0,
            0,
            0,
            0,
            Win.SWP_NOMOVE | Win.SWP_NOSIZE | Win.SWP_NOACTIVATE
        );

    /// <summary>Win+D / mostrar desktop: o shell "cloaka" a janela via DWM (gap deferido na SPEC-042).</summary>
    public static bool IsCloaked(IntPtr hwnd)
    {
        int hr = NativeMethods.DwmGetWindowAttribute(
            hwnd,
            Win.DWMWA_CLOAKED,
            out int cloaked,
            sizeof(int)
        );
        return hr == 0 && cloaked != 0;
    }
}
