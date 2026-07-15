using System.Runtime.InteropServices;

namespace ToastSpike;

/// <summary>
/// Regras de silêncio (política de UI — OP-17, zero regra de jogo). Só permite o toast se o SO
/// aceita notificações AGORA: allowlist == QUNS_ACCEPTS_NOTIFICATIONS. Isso cobre exatamente o
/// que o card pede (tela cheia / apresentação) e mais:
///   - QUNS_RUNNING_D3D_FULL_SCREEN → jogo em fullscreen exclusivo
///   - QUNS_BUSY                     → borderless-fullscreen (o caso comum dos jogos atuais)
///   - QUNS_PRESENTATION_MODE        → apresentação
///   - QUNS_QUIET_TIME               → quiet hours / Focus Assist (cobertura parcial de DND)
/// FAIL-OPEN em erro: perder o ritual das 15h é pior que um toast ocasional (recomendação;
/// confirmar com o founder).
///
/// NOTA (descoberta na implementação): NÃO há API pública limpa para "Foco/DND ligado" no Win11
/// — `Windows.UI.Notifications.NotificationMode` não existe nessa projeção (era suposição da
/// pesquisa). O sinal disponível e confiável é o SHQueryUserNotificationState acima (QUNS_QUIET_TIME
/// captura o Focus Assist em quiet hours). Detecção fina de DND via registry/WNF fica documentada
/// como follow-up (SPEC-005 § FORA: "só documentar"), não implementada aqui.
/// </summary>
internal static class NotificationGate
{
    private enum QUNS
    {
        NotPresent = 1,
        Busy = 2,
        RunningD3dFullScreen = 3,
        PresentationMode = 4,
        AcceptsNotifications = 5,
        QuietTime = 6,
        App = 7,
    }

    [DllImport("shell32.dll")]
    private static extern int SHQueryUserNotificationState(out QUNS state);

    /// <summary>(Allow, Reason). Fail-open: em erro, permite.</summary>
    public static (bool Allow, string Reason) ShouldShow()
    {
        try
        {
            int hr = SHQueryUserNotificationState(out QUNS state);
            if (hr != 0)
                return (true, $"fail-open (SHQueryUserNotificationState HRESULT=0x{hr:X8})");
            if (state != QUNS.AcceptsNotifications)
                return (false, $"suprimido: QUNS_{state}");
            return (true, "permitido (QUNS_ACCEPTS_NOTIFICATIONS)");
        }
        catch (Exception ex)
        {
            return (true, $"fail-open (SHQueryUserNotificationState: {ex.GetType().Name})");
        }
    }
}
