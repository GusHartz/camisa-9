using Microsoft.Toolkit.Uwp.Notifications;

namespace ToastSpike;

/// <summary>
/// Monta e dispara o toast com EXATAMENTE 2 botões (placeholders PLAY/REST), cada um com
/// background activation + o argumento "decision". Consulta o gate de silêncio ANTES de
/// Show(). As strings são de teste — i18n é produção, não spike (SPEC-005 § FORA).
/// </summary>
internal static class ToastEmitter
{
    /// <summary>Dispara o toast se o gate permitir. Retorna (mostrado, motivo-do-gate) para a UI de teste.</summary>
    public static (bool Shown, string GateReason) Send()
    {
        var (allow, reason) = NotificationGate.ShouldShow();
        if (!allow) return (false, reason);

        new ToastContentBuilder()
            // Reminder: o banner FICA na tela com os botões visíveis até o usuário decidir —
            // não some pra Central de Ações (onde o Win11 recolhe e ESCONDE os botões, deixando
            // só o body-tap com argumento vazio). É o cenário certo para o ritual das 15h.
            .SetToastScenario(ToastScenario.Reminder)
            .AddText("camisa-9 — hora da partida")
            .AddText("Você entra em campo? (spike de teste — botões placeholder)")
            .AddButton(new ToastButton()
                .SetContent("PLAY")
                .AddArgument("decision", "play")
                .SetBackgroundActivation())
            .AddButton(new ToastButton()
                .SetContent("REST")
                .AddArgument("decision", "rest")
                .SetBackgroundActivation())
            .Show();

        return (true, reason);
    }
}
