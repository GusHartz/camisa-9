using System.Threading;
using System.Windows;
using BandClient.Api;

namespace BandClient.Auth;

/// <summary>
/// O login mínimo (SPEC-042): e-mail+senha → `POST /v1/auth/login`. Não há signup no v1 (contas
/// nascem por script de operador). Em sucesso, dispara `LoggedIn(token)` — o App persiste via DPAPI
/// e abre a faixa. Erro é roteado pelo status/`code`, nunca pela frase do servidor (OP-11).
/// </summary>
public partial class LoginWindow : Window
{
    private readonly BandApiClient _api;
    private readonly CancellationTokenSource _cts = new();
    private bool _closed;

    /// <summary>Disparado uma vez, com o token opaco, quando o login sucede.</summary>
    public event Action<string>? LoggedIn;

    public LoginWindow(BandApiClient api)
    {
        _api = api;
        InitializeComponent();
        Loaded += (_, _) => EmailBox.Focus();
        // Fechou a janela com um login em voo → cancela e não coordena mais (o furo do MAJOR-2:
        // um login que completa DEPOIS do Close abriria a faixa após o Shutdown do App).
        Closed += (_, _) =>
        {
            _closed = true;
            _cts.Cancel();
        };
    }

    private async void OnLoginClick(object sender, RoutedEventArgs e)
    {
        string email = EmailBox.Text.Trim();
        string password = PasswordBox.Password;
        if (email.Length == 0 || password.Length == 0)
        {
            ShowError("preencha e-mail e senha.");
            return;
        }

        SetBusy(true);
        HideError();
        LoginOutcome outcome = await _api.LoginAsync(email, password, _cts.Token);
        if (_closed)
            return; // a janela já fechou enquanto o login voava → descarta o resultado
        SetBusy(false);

        switch (outcome.Status)
        {
            case ApiStatus.Ok when outcome.Token is { Length: > 0 } token:
                LoggedIn?.Invoke(token);
                break;
            case ApiStatus.InvalidCredentials:
                ShowError("e-mail ou senha inválidos.");
                break;
            case ApiStatus.RateLimited:
                ShowError($"muitas tentativas. Tente em {outcome.RetryAfterSec}s.");
                break;
            case ApiStatus.BadRequest:
                ShowError("requisição inválida.");
                break;
            case ApiStatus.Network:
                ShowError("sem conexão com o servidor.");
                break;
            default:
                ShowError("erro ao entrar. Tente de novo.");
                break;
        }
    }

    private void SetBusy(bool busy)
    {
        LoginButton.IsEnabled = !busy;
        LoginButton.Content = busy ? "entrando…" : "Entrar";
    }

    private void ShowError(string msg)
    {
        ErrorText.Text = msg;
        ErrorText.Visibility = Visibility.Visible;
    }

    private void HideError() => ErrorText.Visibility = Visibility.Collapsed;
}
