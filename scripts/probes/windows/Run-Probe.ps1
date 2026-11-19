# Windows PowerShell 5.1 and PowerShell 7 compatible.
# Local portable utility only. No installs, deploys, migrations, service changes,
# SSH-key registration, or customer-data writes are performed.
$ErrorActionPreference = 'Stop'
$TempFolder = $null
$ExitCode = 1
try {
    Write-Host ''
    Write-Host 'WhachatCRM - read-only queue inventory' -ForegroundColor Cyan
    Write-Host 'Your production service and automations will stay running.'
    Write-Host ''
    if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
        throw 'ACCESS_NEEDED: Windows OpenSSH Client is not available. Stop here and send this message back. No changes were made.'
    }
    $Architecture = $env:PROCESSOR_ARCHITEW6432
    if (-not $Architecture) { $Architecture = $env:PROCESSOR_ARCHITECTURE }
    switch ($Architecture.ToUpperInvariant()) {
        'AMD64' { $Target = 'x86_64-pc-windows-msvc'; $ExpectedHash = '1f468573a544587a2c22e6262abc393dafaaf8627ae9f45a5ef2e7d96423c8b6' }
        'ARM64' { $Target = 'aarch64-pc-windows-msvc'; $ExpectedHash = 'e733d050060ac069f1e37b6ae55bf1565878ee82241c5934820d90ffe47544e6' }
        'X86'   { $Target = 'i686-pc-windows-msvc'; $ExpectedHash = '5458648ebd0cfe47f2da81eb3461d46e150d3f5ffbfa9179bb6d03869ace970e' }
        default { throw 'UNSUPPORTED_WINDOWS: Send this message back. No production changes were made.' }
    }
    $TempFolder = Join-Path ([IO.Path]::GetTempPath()) ('WhachatCRM-Probe-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $TempFolder | Out-Null
    $Archive = Join-Path $TempFolder 'railway.zip'
    $Download = 'https://github.com/railwayapp/cli/releases/download/v5.75.0/railway-v5.75.0-' + $Target + '.zip'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Host '1/3 Downloading and verifying the official Railway utility...'
    Invoke-WebRequest -UseBasicParsing -Uri $Download -OutFile $Archive
    $ActualHash = (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ActualHash -ne $ExpectedHash) {
        throw 'DOWNLOAD_CHECK_FAILED: The download did not match the official checksum. Nothing was executed.'
    }
    Expand-Archive -LiteralPath $Archive -DestinationPath (Join-Path $TempFolder 'utility')
    $Binaries = @(Get-ChildItem -Path (Join-Path $TempFolder 'utility') -Recurse -Filter 'railway.exe' -File)
    if ($Binaries.Count -ne 1) { throw 'DOWNLOAD_FORMAT_ERROR: No unique official utility was found.' }
    $Railway = $Binaries[0].FullName
    $env:RAILWAY_CALLER = 'skill:use-railway@1.3.5'
    $env:RAILWAY_AGENT_SESSION = 'pr330-queue-inventory'
    Write-Host '2/3 Checking sign-in...'
    $SignedIn = $false
    $OldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $WhoOutput = & $Railway whoami --json 2>$null
        $SignedIn = ($LASTEXITCODE -eq 0)
    } finally { $ErrorActionPreference = $OldPreference }
    if (-not $SignedIn) {
        Write-Host 'A Railway sign-in page will open in your browser.' -ForegroundColor Yellow
        Write-Host 'Sign in with your usual Railway account, approve CLI login, then return here.'
        & $Railway login
        if ($LASTEXITCODE -ne 0) { throw 'LOGIN_NOT_COMPLETED: Sign-in did not finish. No production changes were made.' }
    }
    Write-Host '3/3 Running the check inside the existing WhachatCRM production service...'
    Write-Host 'This will use existing authorized SSH access only. It cannot add an SSH key.'
    $Payload = 'J3VzZSBzdHJpY3QnOwovLyBJbnZlbnRvcnkgb25seTogbm8gQnVsbE1RIG9iamVjdHMsIEx1YSwgcXVldWUgcGF1c2UvcmVzdW1lLCBvciBqb2IgbXV0YXRpb25zLgpjb25zdCB7Y3JlYXRlUmVxdWlyZX09cmVxdWlyZSgnbm9kZTptb2R1bGUnKTsKY29uc3QgcmVxPWNyZWF0ZVJlcXVpcmUocHJvY2Vzcy5jd2QoKSsnL3BhY2thZ2UuanNvbicpOwpjb25zdCBlbnY9cHJvY2Vzcy5lbnY7CmNvbnN0IHJlc3VsdD17Y2hlY2s6J3F1ZXVlX2ludmVudG9yeScscmVzdWx0OidGQUlMJyxvYnNlcnZlZEF0Om5ldyBEYXRlKCkudG9JU09TdHJpbmcoKX07CmxldCByZWRpczsKZnVuY3Rpb24gZW5zdXJlKG9rLHJlYXNvbil7aWYoIW9rKXtjb25zdCBlPW5ldyBFcnJvcihyZWFzb24pO2Uuc2FmZVJlYXNvbj1yZWFzb247dGhyb3cgZTt9fQooYXN5bmMoKT0+ewogdHJ5ewogIGVuc3VyZShlbnYuUkFJTFdBWV9QUk9KRUNUX0lEPT09JzJhZGVlYTQ5LTQzMWMtNGRkZi04ODE1LTljZTg5YWY2NmYzMicgJiYgZW52LlJBSUxXQVlfRU5WSVJPTk1FTlRfSUQ9PT0nZmEyZThjMzAtNzJlYS00Njg4LTg3N2YtNGE2OGUyNDE5OGJjJyAmJiBlbnYuUkFJTFdBWV9TRVJWSUNFX0lEPT09J2E3Yjc1MTM5LTViZjgtNGEwMi1iNGFiLWI3ZDEyZTE3ZTc3MCcgJiYgISFlbnYuUkFJTFdBWV9ERVBMT1lNRU5UX0lELCd3cm9uZ19vcl91bmF0dGVzdGVkX3J1bnRpbWUnKTsKICBlbnN1cmUoL15bYS1mMC05XXs0MH0kLy50ZXN0KGVudi5SQUlMV0FZX0dJVF9DT01NSVRfU0hBfHwnJyksJ3VuYXR0ZXN0ZWRfcnVudGltZV9jb21taXQnKTsKICByZXN1bHQuZGVwbG95bWVudElkPWVudi5SQUlMV0FZX0RFUExPWU1FTlRfSUQ7cmVzdWx0LmNvbW1pdD1lbnYuUkFJTFdBWV9HSVRfQ09NTUlUX1NIQTtyZXN1bHQucmVwbGljYUlkPWVudi5SQUlMV0FZX1JFUExJQ0FfSUR8fG51bGw7CiAgZW5zdXJlKCEhZW52LlJFRElTX1VSTCwncmVkaXNfdXJsX2Fic2VudCcpOwogIGNvbnN0IFJlZGlzPXJlcSgnaW9yZWRpcycpOwogIHJlZGlzPW5ldyBSZWRpcyhlbnYuUkVESVNfVVJMLHtsYXp5Q29ubmVjdDp0cnVlLGVuYWJsZVJlYWR5Q2hlY2s6ZmFsc2UsZW5hYmxlT2ZmbGluZVF1ZXVlOmZhbHNlLG1heFJldHJpZXNQZXJSZXF1ZXN0OjAscmV0cnlTdHJhdGVneTooKT0+bnVsbCxjb25uZWN0VGltZW91dDo1MDAwLGNvbW1hbmRUaW1lb3V0OjUwMDAsYXV0b1Jlc3Vic2NyaWJlOmZhbHNlLGF1dG9SZXNlbmRVbmZ1bGZpbGxlZENvbW1hbmRzOmZhbHNlLHRsczplbnYuUkVESVNfVVJMLnN0YXJ0c1dpdGgoJ3JlZGlzczovLycpfHxlbnYuUkVESVNfVVJMLmluY2x1ZGVzKCd1cHN0YXNoLmlvJyk/e306dW5kZWZpbmVkfSk7CiAgcmVkaXMub24oJ2Vycm9yJywoKT0+e30pO2F3YWl0IHJlZGlzLmNvbm5lY3QoKTsKICByZXN1bHQucXVldWU9J3VuaWZpZWQtaW5ib3gnO3Jlc3VsdC5zYW1wbGVzPVtdOwogIGZvcihsZXQgaT0wO2k8MjtpKyspewogICBjb25zdCBrPSdidWxsOnVuaWZpZWQtaW5ib3g6JzsKICAgY29uc3QgY29tbWFuZHM9W1snZXhpc3RzJyxrKydtZXRhJ10sWydsbGVuJyxrKydhY3RpdmUnXSxbJ2xsZW4nLGsrJ3dhaXQnXSxbJ2xsZW4nLGsrJ3BhdXNlZCddLFsnemNhcmQnLGsrJ2RlbGF5ZWQnXSxbJ3pjYXJkJyxrKydmYWlsZWQnXSxbJ3pjYXJkJyxrKydwcmlvcml0aXplZCddLFsnemNhcmQnLGsrJ3dhaXRpbmctY2hpbGRyZW4nXSxbJ2hnZXQnLGsrJ21ldGEnLCdwYXVzZWQnXV07CiAgIC8vIE9uZSBhdG9taWMgc25hcHNob3QuIEV2ZXJ5IGNvbW1hbmQgaW5zaWRlIHRoaXMgdHJhbnNhY3Rpb24gcmVhZHMgb25seS4KICAgY29uc3Qgcm93cz1hd2FpdCByZWRpcy5tdWx0aShjb21tYW5kcykuZXhlYygpOwogICBlbnN1cmUocm93cyYmcm93cy5sZW5ndGg9PT1jb21tYW5kcy5sZW5ndGgmJnJvd3MuZXZlcnkocj0+IXJbMF0pLCdyZWRpc19yZWFkX2ZhaWxlZCcpOwogICBjb25zdCB2PXJvd3MubWFwKHI9PnJbMV0pOwogICByZXN1bHQuc2FtcGxlcy5wdXNoKHthdDpuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksbWV0YWRhdGFQcmVzZW50OnZbMF09PT0xLGFjdGl2ZTp2WzFdLHdhaXRpbmc6dlsyXSxwYXVzZWRXYWl0aW5nOnZbM10sZGVsYXllZDp2WzRdLGZhaWxlZDp2WzVdLHByaW9yaXRpemVkOnZbNl0sd2FpdGluZ0NoaWxkcmVuOnZbN10scXVldWVQYXVzZWQ6dls4XT09PScxJ30pOwogICBpZihpPT09MClhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlPT5zZXRUaW1lb3V0KHJlc29sdmUsMTAwMDApKTsKICB9CiAgcmVzdWx0LnJlc3VsdD0nUkVBRF9DT01QTEVURSc7cmVzdWx0LmxpbWl0YXRpb249J0ludmVudG9yeSBvbmx5OyBub3QgcHJvb2Ygb2Ygc3RvcHBlZCB3b3JrZXJzLCBkcmFpbmVkIEhUVFAvQUksIG9yIGEgcmVsZWFzZSBhcHByb3ZhbC4nOwogfWNhdGNoKGUpe3Jlc3VsdC5yZWFzb249ZS5zYWZlUmVhc29ufHwnaW52ZW50b3J5X2ZhaWxlZCc7cHJvY2Vzcy5leGl0Q29kZT0xO30KIGZpbmFsbHl7aWYocmVkaXMpcmVkaXMuZGlzY29ubmVjdCgpO2NvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KHJlc3VsdCkpO30KfSkoKTsK'
    $RemoteCode = "eval(Buffer.from('$Payload','base64').toString('utf8'))"
    $Arguments = @(
        'ssh',
        '--project', '2adeea49-431c-4ddf-8815-9ce89af66f32',
        '--environment', 'fa2e8c30-72ea-4688-877f-4a68e24198bc',
        '--service', 'a7b75139-5bf8-4a02-b4ab-b7d12e17e770',
        '--', 'node', '-e', $RemoteCode
    )
    # Redirect stdin so Railway's SSH implementation cannot prompt to register a key.
    # Existing authorized keys/agent identities are still supported by Railway.
    $OldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $Captured = @('' | & $Railway @Arguments 2>&1)
        $NativeExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $OldPreference }
    $ResultLine = $null
    foreach ($Item in $Captured) {
        $Line = [string]$Item
        $Line = [regex]::Replace($Line, '\x1B\[[0-9;]*[A-Za-z]', '').Trim()
        if ($Line.StartsWith('{')) {
            try {
                $Parsed = $Line | ConvertFrom-Json
                if ($Parsed.check -eq 'queue_inventory' -and ($Parsed.result -eq 'READ_COMPLETE' -or $Parsed.result -eq 'FAIL')) {
                    $ResultLine = $Line
                }
            } catch { }
        }
    }
    if (-not $ResultLine) {
        Write-Host ''
        Write-Host 'ACCESS_NEEDED: The runtime probe could not start. No SSH key or production setting was changed.' -ForegroundColor Yellow
        Write-Host 'Return that ACCESS_NEEDED message to the chat. Do not change Railway settings.'
        Write-Host ('Railway connection exit code: ' + $NativeExit)
        $ExitCode = 2
    } else {
        Write-Host ''
        Write-Host 'RESULT - copy the line below into the chat:' -ForegroundColor Cyan
        Write-Host $ResultLine
        $ResultLine | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'Probe-Result.txt') -Encoding UTF8
        try { Set-Clipboard -Value $ResultLine; Write-Host 'The result is also copied to your clipboard. Return to the chat and press Ctrl+V.' } catch { }
        $ExitCode = $NativeExit
    }
} catch {
    Write-Host ''
    Write-Host 'The check stopped without deploying or changing production.' -ForegroundColor Yellow
    Write-Host $_.Exception.Message
} finally {
    if ($TempFolder -and (Test-Path -LiteralPath $TempFolder)) {
        Remove-Item -LiteralPath $TempFolder -Recurse -Force -ErrorAction SilentlyContinue
    }
}
exit $ExitCode
