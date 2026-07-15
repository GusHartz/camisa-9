using System.Diagnostics;
using System.Windows;

namespace ToastSpike;

/// <summary>
/// Janela-gatilho de TESTE (só no launch normal). Botões para disparar o toast e para
/// matar o processo (simular "app fechado" antes de testar a cold-activation). OP-17:
/// nenhuma regra de jogo aqui — só aciona o mecanismo.
/// </summary>
public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Status.Text = $"PID {Environment.ProcessId} — pronto. Stub esperado em http://localhost:5599/.";
    }

    private void OnSend(object sender, RoutedEventArgs e)
    {
        var (shown, reason) = ToastEmitter.Send();
        Status.Text = shown
            ? $"Toast disparado (PID {Environment.ProcessId}). Gate: {reason}.\nClique um botão do toast — ou mate o app (2) e clique com ele FECHADO."
            : $"Toast SUPRIMIDO pelo gate de silêncio: {reason}.";
    }

    private void OnKill(object sender, RoutedEventArgs e)
    {
        // Encerra abruptamente para o teste de cold-start (o Notification Center segura o toast).
        Process.GetCurrentProcess().Kill();
    }
}
