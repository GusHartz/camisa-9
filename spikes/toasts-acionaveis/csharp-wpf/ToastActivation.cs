using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using Microsoft.Toolkit.Uwp.Notifications;
using Windows.Foundation.Collections;

namespace ToastSpike;

/// <summary>
/// Handler da ativação: parseia o argumento do botão, faz POST ao stub local
/// (BLOQUEANTE — o processo cold não pode morrer antes do POST landar) e grava um
/// arquivo de PROVA (PID, cold?, decision, HTTP status, ack). OP-17: o cliente só
/// encaminha um payload OPACO; toda validade é server-side (futuro).
/// </summary>
internal static class ToastActivation
{
    // Constantes (NÃO env vars): o processo cold é lançado pelo Windows via COM, sem
    // herdar o ambiente do shell — então a URL/paths precisam ser fixos e conhecidos.
    private const string StubUrl = "http://localhost:5599/";

    private static readonly string BaseDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "camisa9-toast-spike");
    private static readonly string ProofPath = Path.Combine(BaseDir, "proof.jsonl");

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(8) };

    public static void Handle(string argument, ValueSet userInput, bool cold)
    {
        Directory.CreateDirectory(BaseDir);
        int pid = Environment.ProcessId;
        string decision = ParseDecision(argument);

        int httpStatus = 0;
        string ack = string.Empty;
        string error = string.Empty;
        try
        {
            string payload = JsonSerializer.Serialize(new
            {
                decision,          // payload OPACO (OP-17) — o cliente só encaminha
                pid,
                cold,
                argument,
                sentAt = TimestampUtc(),
            });
            using var content = new StringContent(payload, Encoding.UTF8, "application/json");
            // Bloqueante de propósito: cold não pode sair antes do ack.
            using var resp = Http.PostAsync(StubUrl, content).GetAwaiter().GetResult();
            httpStatus = (int)resp.StatusCode;
            ack = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            error = ex.GetType().Name + ": " + ex.Message;
        }

        WriteProof(new
        {
            at = TimestampUtc(),
            pid,
            cold,
            decision,
            argument,
            httpStatus,
            ack = Truncate(ack, 300),
            error,
        });
    }

    public static void WriteWatchdogTimeout()
    {
        Directory.CreateDirectory(BaseDir);
        WriteProof(new { at = TimestampUtc(), pid = Environment.ProcessId, watchdogTimeout = true });
    }

    private static string ParseDecision(string argument)
    {
        try
        {
            ToastArguments args = ToastArguments.Parse(argument);
            return args.TryGetValue("decision", out string? v) ? v : "(sem decision)";
        }
        catch
        {
            return "(argumento nao-parseavel)";
        }
    }

    private static void WriteProof(object o)
    {
        try
        {
            // File.AppendAllText usa UTF-8 sem BOM por padrão — jsonl limpo.
            File.AppendAllText(ProofPath, JsonSerializer.Serialize(o) + Environment.NewLine);
        }
        catch
        {
            // A prova é best-effort; nunca derrubar o handler por causa dela.
        }
    }

    private static string TimestampUtc() => DateTime.UtcNow.ToString("o");

    private static string Truncate(string s, int n) => s.Length <= n ? s : s.Substring(0, n);
}
