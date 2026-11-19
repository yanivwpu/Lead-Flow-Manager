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
    $Payload = 'J3VzZSBzdHJpY3QnOwovLyBJbnZlbnRvcnkgb25seTogbm8gQnVsbE1RIG9iamVjdHMsIEx1YSwgcXVldWUgcGF1c2UvcmVzdW1lLCBvciBqb2IgbXV0YXRpb25zLgpjb25zdCB7Y3JlYXRlUmVxdWlyZX09cmVxdWlyZSgnbm9kZTptb2R1bGUnKTsKY29uc3QgcmVxPWNyZWF0ZVJlcXVpcmUocHJvY2Vzcy5jd2QoKSsnL3BhY2thZ2UuanNvbicpOwpjb25zdCBlbnY9cHJvY2Vzcy5lbnY7CmNvbnN0IHJlc3VsdD17Y2hlY2s6J3F1ZXVlX2ludmVudG9yeScscmVzdWx0OidGQUlMJyxvYnNlcnZlZEF0Om5ldyBEYXRlKCkudG9JU09TdHJpbmcoKX07CmxldCByZWRpczsKZnVuY3Rpb24gZW5zdXJlKG9rLHJlYXNvbil7aWYoIW9rKXtjb25zdCBlPW5ldyBFcnJvcihyZWFzb24pO2Uuc2FmZVJlYXNvbj1yZWFzb247dGhyb3cgZTt9fQooYXN5bmMoKT0+ewogdHJ5ewogIGVuc3VyZShlbnYuUkFJTFdBWV9QUk9KRUNUX0lEPT09JzJhZGVlYTQ5LTQzMWMtNGRkZi04ODE1LTljZTg5YWY2NmYzMicgJiYgZW52LlJBSUxXQVlfRU5WSVJPTk1FTlRfSUQ9PT0nZmEyZThjMzAtNzJlYS00Njg4LTg3N2YtNGE2OGUyNDE5OGJjJyAmJiBlbnYuUkFJTFdBWV9TRVJWSUNFX0lEPT09J2E3Yjc1MTM5LTViZjgtNGEwMi1iNGFiLWI3ZDEyZTE3ZTc3MCcgJiYgISFlbnYuUkFJTFdBWV9ERVBMT1lNRU5UX0lELCd3cm9uZ19vcl91bmF0dGVzdGVkX3J1bnRpbWUnKTsKICBlbnN1cmUoZW52LlJBSUxXQVlfR0lUX0NPTU1JVF9TSEE9PT0nNmYzMjEyZmQ0MzQwODAzY2IxNWNhNjQxMmExNDUzNDlmODJhY2M2ZCcsJ3Byb2R1Y3Rpb25fY29tbWl0X2NoYW5nZWRfcmVjaGVja19yZXF1aXJlZCcpOwogIHJlc3VsdC5kZXBsb3ltZW50SWQ9ZW52LlJBSUxXQVlfREVQTE9ZTUVOVF9JRDtyZXN1bHQuY29tbWl0PWVudi5SQUlMV0FZX0dJVF9DT01NSVRfU0hBO3Jlc3VsdC5yZXBsaWNhSWQ9ZW52LlJBSUxXQVlfUkVQTElDQV9JRHx8bnVsbDsKICBlbnN1cmUoISFlbnYuUkVESVNfVVJMLCdyZWRpc191cmxfYWJzZW50Jyk7CiAgY29uc3QgUmVkaXM9cmVxKCdpb3JlZGlzJyk7CiAgcmVkaXM9bmV3IFJlZGlzKGVudi5SRURJU19VUkwse2xhenlDb25uZWN0OnRydWUsZW5hYmxlUmVhZHlDaGVjazpmYWxzZSxlbmFibGVPZmZsaW5lUXVldWU6ZmFsc2UsbWF4UmV0cmllc1BlclJlcXVlc3Q6MCxyZXRyeVN0cmF0ZWd5OigpPT5udWxsLGNvbm5lY3RUaW1lb3V0OjUwMDAsY29tbWFuZFRpbWVvdXQ6NTAwMCxhdXRvUmVzdWJzY3JpYmU6ZmFsc2UsYXV0b1Jlc2VuZFVuZnVsZmlsbGVkQ29tbWFuZHM6ZmFsc2UsdGxzOmVudi5SRURJU19VUkwuc3RhcnRzV2l0aCgncmVkaXNzOi8vJyl8fGVudi5SRURJU19VUkwuaW5jbHVkZXMoJ3Vwc3Rhc2guaW8nKT97fTp1bmRlZmluZWR9KTsKICByZWRpcy5vbignZXJyb3InLCgpPT57fSk7YXdhaXQgcmVkaXMuY29ubmVjdCgpOwogIHJlc3VsdC5xdWV1ZT0ndW5pZmllZC1pbmJveCc7cmVzdWx0LnNhbXBsZXM9W107CiAgZm9yKGxldCBpPTA7aTwyO2krKyl7CiAgIGNvbnN0IGs9J2J1bGw6dW5pZmllZC1pbmJveDonOwogICBjb25zdCBjb21tYW5kcz1bWydleGlzdHMnLGsrJ21ldGEnXSxbJ2xsZW4nLGsrJ2FjdGl2ZSddLFsnbGxlbicsaysnd2FpdCddLFsnbGxlbicsaysncGF1c2VkJ10sWyd6Y2FyZCcsaysnZGVsYXllZCddLFsnemNhcmQnLGsrJ2ZhaWxlZCddLFsnemNhcmQnLGsrJ3ByaW9yaXRpemVkJ10sWyd6Y2FyZCcsaysnd2FpdGluZy1jaGlsZHJlbiddLFsnaGdldCcsaysnbWV0YScsJ3BhdXNlZCddXTsKICAgLy8gT25lIGF0b21pYyBzbmFwc2hvdC4gRXZlcnkgY29tbWFuZCBpbnNpZGUgdGhpcyB0cmFuc2FjdGlvbiByZWFkcyBvbmx5LgogICBjb25zdCByb3dzPWF3YWl0IHJlZGlzLm11bHRpKGNvbW1hbmRzKS5leGVjKCk7CiAgIGVuc3VyZShyb3dzJiZyb3dzLmxlbmd0aD09PWNvbW1hbmRzLmxlbmd0aCYmcm93cy5ldmVyeShyPT4hclswXSksJ3JlZGlzX3JlYWRfZmFpbGVkJyk7CiAgIGNvbnN0IHY9cm93cy5tYXAocj0+clsxXSk7CiAgIHJlc3VsdC5zYW1wbGVzLnB1c2goe2F0Om5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxtZXRhZGF0YVByZXNlbnQ6dlswXT09PTEsYWN0aXZlOnZbMV0sd2FpdGluZzp2WzJdLHBhdXNlZFdhaXRpbmc6dlszXSxkZWxheWVkOnZbNF0sZmFpbGVkOnZbNV0scHJpb3JpdGl6ZWQ6dls2XSx3YWl0aW5nQ2hpbGRyZW46dls3XSxxdWV1ZVBhdXNlZDp2WzhdPT09JzEnfSk7CiAgIGlmKGk9PT0wKWF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmU9PnNldFRpbWVvdXQocmVzb2x2ZSwxMDAwMCkpOwogIH0KICByZXN1bHQucmVzdWx0PSdSRUFEX0NPTVBMRVRFJztyZXN1bHQubGltaXRhdGlvbj0nSW52ZW50b3J5IG9ubHk7IG5vdCBwcm9vZiBvZiBzdG9wcGVkIHdvcmtlcnMsIGRyYWluZWQgSFRUUC9BSSwgb3IgYSByZWxlYXNlIGFwcHJvdmFsLic7CiB9Y2F0Y2goZSl7cmVzdWx0LnJlYXNvbj1lLnNhZmVSZWFzb258fCdpbnZlbnRvcnlfZmFpbGVkJztwcm9jZXNzLmV4aXRDb2RlPTE7fQogZmluYWxseXtpZihyZWRpcylyZWRpcy5kaXNjb25uZWN0KCk7Y29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkocmVzdWx0KSk7fQp9KSgpOwo='
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
