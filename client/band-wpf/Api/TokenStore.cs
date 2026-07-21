using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace BandClient.Api;

/// <summary>
/// Persiste o token de sessão em disco protegido por DPAPI, escopo CurrentUser (requisito do
/// ADR-003 — NUNCA texto plano). Usa P/Invoke direto de `crypt32.dll` (CryptProtectData/
/// CryptUnprotectData) em vez do pacote NuGet ProtectedData → o cliente fica zero-dependência,
/// como o spike. O blob vive em %LOCALAPPDATA%\NextGoat\ (fora do repo/OneDrive). Blob ilegível/
/// de outra máquina/usuário → `TryLoad` devolve false → o app degrada para re-login, sem crash.
/// </summary>
public sealed class TokenStore
{
    private const uint CryptprotectUiForbidden = 0x1; // sem prompt de UI (headless-safe)

    private readonly string _path;

    public TokenStore()
    {
        string dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "NextGoat"
        );
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "band-token.bin");
    }

    /// <summary>Só para o smoke: onde o blob mora (verificar que não contém o token em texto plano).</summary>
    public string BlobPath => _path;

    public bool TryLoad(out string token)
    {
        token = string.Empty;
        try
        {
            if (!File.Exists(_path))
                return false;
            byte[] blob = File.ReadAllBytes(_path);
            byte[]? clear = Unprotect(blob);
            if (clear is null)
                return false;
            token = Encoding.UTF8.GetString(clear);
            return token.Length > 0;
        }
        catch
        {
            return false; // blob corrompido/de outra máquina → re-login
        }
    }

    public void Save(string token)
    {
        byte[]? blob = Protect(Encoding.UTF8.GetBytes(token));
        if (blob is null)
            return; // falha de DPAPI é tolerável: o app só volta a pedir login no próximo boot
        try
        {
            File.WriteAllBytes(_path, blob);
        }
        catch
        {
            // best-effort (simétrico ao Clear): I/O travado (disco/AV/ACL) só re-pede login no
            // próximo boot — NUNCA crasha durante o login.
        }
    }

    public void Clear()
    {
        try
        {
            if (File.Exists(_path))
                File.Delete(_path);
        }
        catch
        {
            // best-effort
        }
    }

    private static byte[]? Protect(byte[] clear)
    {
        var input = new DataBlob(clear);
        try
        {
            if (
                !CryptProtectData(
                    ref input,
                    null,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    CryptprotectUiForbidden,
                    out DataBlob output
                )
            )
                return null;
            return ReadAndFree(ref output);
        }
        finally
        {
            input.Free();
        }
    }

    private static byte[]? Unprotect(byte[] blob)
    {
        var input = new DataBlob(blob);
        try
        {
            if (
                !CryptUnprotectData(
                    ref input,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    CryptprotectUiForbidden,
                    out DataBlob output
                )
            )
                return null;
            return ReadAndFree(ref output);
        }
        finally
        {
            input.Free();
        }
    }

    private static byte[] ReadAndFree(ref DataBlob blob)
    {
        try
        {
            var bytes = new byte[blob.cbData];
            Marshal.Copy(blob.pbData, bytes, 0, blob.cbData);
            return bytes;
        }
        finally
        {
            Marshal.FreeHGlobal(blob.pbData); // libera o buffer do DPAPI mesmo se o alloc/copy lançar
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DataBlob
    {
        public int cbData;
        public IntPtr pbData;

        public DataBlob(byte[] data)
        {
            cbData = data.Length;
            pbData = Marshal.AllocHGlobal(data.Length);
            Marshal.Copy(data, 0, pbData, data.Length);
        }

        public void Free()
        {
            if (pbData != IntPtr.Zero)
                Marshal.FreeHGlobal(pbData);
            pbData = IntPtr.Zero;
        }
    }

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptProtectData(
        ref DataBlob pDataIn,
        string? szDataDescr,
        IntPtr pOptionalEntropy,
        IntPtr pvReserved,
        IntPtr pPromptStruct,
        uint dwFlags,
        out DataBlob pDataOut
    );

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptUnprotectData(
        ref DataBlob pDataIn,
        IntPtr ppszDataDescr,
        IntPtr pOptionalEntropy,
        IntPtr pvReserved,
        IntPtr pPromptStruct,
        uint dwFlags,
        out DataBlob pDataOut
    );
}
