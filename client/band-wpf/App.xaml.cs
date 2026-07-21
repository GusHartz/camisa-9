using System.IO;
using System.Text.Json;
using System.Threading;
using System.Windows;
using BandClient.Api;
using BandClient.Auth;
using BandClient.View;

namespace BandClient;

/// <summary>
/// O coordenador impuro (SPEC-042). Single-instance via Mutex; carrega a base URL do `config.json`;
/// se há token salvo (DPAPI) abre a faixa direto, senão o login. No 401 durante o poll, limpa o token
/// e volta ao login. Controla o shutdown explicitamente (o login é transitório — fechar a faixa OU
/// fechar o login sem entrar encerra o app).
/// </summary>
public partial class App : Application
{
    private const string DefaultBaseUrl = "http://127.0.0.1:3000";

    private static Mutex? _single;
    private TokenStore _tokens = null!;
    private BandApiClient _api = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        ShutdownMode = ShutdownMode.OnExplicitShutdown; // login→faixa→saída são controlados aqui

        _single = new Mutex(true, "camisa9-band-wpf-single", out bool isNew);
        if (!isNew)
        {
            Shutdown();
            return;
        }

        _tokens = new TokenStore();
        _api = new BandApiClient(LoadBaseUrl());

        if (_tokens.TryLoad(out string token))
        {
            _api.SetToken(token);
            ShowBand();
        }
        else
        {
            ShowLogin();
        }
    }

    private void ShowLogin()
    {
        var login = new LoginWindow(_api);
        bool loggedIn = false;
        login.LoggedIn += token =>
        {
            loggedIn = true;
            _tokens.Save(token);
            _api.SetToken(token);
            login.Close();
            ShowBand();
        };
        login.Closed += (_, _) =>
        {
            if (!loggedIn)
                Shutdown(); // fechou o login sem entrar → sair
        };
        login.Show();
    }

    private void ShowBand()
    {
        var band = new MainWindow(_api, new BandViewModel(LoadReplayWatchSeconds()));
        bool reauthing = false;
        band.ReauthRequired += () =>
        {
            reauthing = true; // não deixar o Closed encerrar o app: vamos reabrir o login
            _api.ClearToken(); // esquece o token 401'd em memória (o do disco cai no Clear)
            _tokens.Clear();
            band.Close();
            ShowLogin();
        };
        band.Closed += (_, _) =>
        {
            if (!reauthing)
                Shutdown(); // fechou a faixa (duplo-clique) → sair
        };
        MainWindow = band;
        band.Show();
    }

    private static string LoadBaseUrl()
    {
        try
        {
            string path = Path.Combine(AppContext.BaseDirectory, "config.json");
            if (File.Exists(path))
            {
                using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(path));
                if (
                    doc.RootElement.TryGetProperty("apiBaseUrl", out JsonElement v)
                    && v.GetString() is { Length: > 0 } url
                    && Uri.TryCreate(url, UriKind.Absolute, out Uri? parsed)
                    && parsed.Scheme is "http" or "https"
                )
                    return url; // URI absoluto http/https válido; senão cai no default (sem crash)
            }
        }
        catch
        {
            // config ausente/torto → cai no default de dev
        }
        return DefaultBaseUrl;
    }

    // A duração da watch do replay (SPEC-044), do config.json. Default 240s (~4 min); tolerante.
    private static int LoadReplayWatchSeconds()
    {
        try
        {
            string path = Path.Combine(AppContext.BaseDirectory, "config.json");
            if (File.Exists(path))
            {
                using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(path));
                if (
                    doc.RootElement.TryGetProperty("replayWatchSeconds", out JsonElement v)
                    && v.TryGetInt32(out int secs)
                    && secs > 0
                )
                    return secs;
            }
        }
        catch
        {
            // config ausente/torto → default
        }
        return 240;
    }
}
