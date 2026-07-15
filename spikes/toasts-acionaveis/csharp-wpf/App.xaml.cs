using System.Threading;
using System.Windows;
using Microsoft.Toolkit.Uwp.Notifications;

namespace ToastSpike;

/// <summary>
/// Bootstrap do spike. O CERNE do de-risk: distinguir COLD-START (o processo foi
/// lançado pelo clique num botão do toast, com o app fechado) de um launch normal.
/// No cold rodamos HEADLESS (nunca criamos janela), encaminhamos a decisão ao stub e
/// saímos. Warm e cold saem pelo MESMO OnActivated; WasCurrentProcessToastActivated()
/// os distingue. Ver README para a técnica (WCT ToastNotificationManagerCompat).
/// </summary>
public partial class App : Application
{
    private static Mutex? _singleInstance;
    private static readonly ManualResetEventSlim Handled = new(false);

    protected override void OnStartup(StartupEventArgs e)
    {
        // Subscrever a ativação ANTES de qualquer janela — warm E cold saem por aqui.
        ToastNotificationManagerCompat.OnActivated += OnToastActivated;

        base.OnStartup(e);

        // Nós controlamos o fim do processo (não o WPF por contagem de janelas).
        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        if (ToastNotificationManagerCompat.WasCurrentProcessToastActivated())
        {
            // COLD: este processo só existe para atender o clique. NÃO abrir janela;
            // o OnActivated (thread de background) encaminha e o watchdog encerra.
            new Thread(ColdWatchdog) { IsBackground = true }.Start();
            return;
        }

        // Launch normal: instância única + janela-gatilho de teste.
        _singleInstance = new Mutex(true, "camisa9-toast-spike-single", out bool isNew);
        if (!isNew) { Shutdown(); return; }
        new MainWindow().Show();
    }

    private void OnToastActivated(ToastNotificationActivatedEventArgsCompat e)
    {
        bool cold = ToastNotificationManagerCompat.WasCurrentProcessToastActivated();
        // Bloqueante: POST ao stub + gravação da prova. O processo cold NÃO pode
        // morrer antes do POST landar — por isso NÃO é fire-and-forget.
        ToastActivation.Handle(e.Argument, e.UserInput, cold);
        Handled.Set();
        // Warm: NÃO trazer janela à frente, NÃO sair (o app-gatilho segue vivo).
        // Cold: o ColdWatchdog abaixo encerra assim que Handled é sinalizado.
    }

    private void ColdWatchdog()
    {
        // Espera o handler concluir (ack + prova) e encerra; timeout evita processo pendurado.
        if (!Handled.Wait(TimeSpan.FromSeconds(15)))
            ToastActivation.WriteWatchdogTimeout();
        Dispatcher.Invoke(Shutdown);
    }
}
