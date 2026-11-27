#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._@-]*$')][string]$Target = 'root@158.255.0.101',
    [ValidateRange(1,65535)][int]$SshPort = 22,
    [ValidateRange(1024,65535)][int]$VpsPort = 18185,
    [ValidateRange(1024,65535)][int]$LocalPort = 18185,
    [string]$ArchivePath,
    [string]$AudioPath,
    [string]$CaBundle,
    [string]$ReportPath,
    [switch]$AuditOnly,
    [switch]$InstallSshKey,
    [switch]$PromptKey,
    [switch]$ConfirmMock,
    [switch]$AllowDemoFleet,
    [ValidatePattern('^[a-f0-9]{32}$')][string]$StopRunId,
    [switch]$TunnelOnly
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
$scp = (Get-Command scp.exe -ErrorAction Stop).Source
$verify = @('-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10')
$identity = @()

function Require-Success([int]$Code, [string]$Step) {
    if ($Code -ne 0) { throw "$Step (exit $Code)" }
}

if ($InstallSshKey) {
    $keygen = (Get-Command ssh-keygen.exe -ErrorAction Stop).Source
    $keyDir = Join-Path $env:USERPROFILE '.ssh'
    [void][IO.Directory]::CreateDirectory($keyDir)
    $keyFile = Join-Path $keyDir 'judrive_vps_ed25519'
    if (-not (Test-Path -LiteralPath $keyFile -PathType Leaf)) {
        & $keygen -t ed25519 -f $keyFile -C judrive-live-acceptance
        Require-Success $LASTEXITCODE 'ssh-keygen'
    }
    $public = [IO.File]::ReadAllText("$keyFile.pub").Trim()
    if ($public -notmatch '^ssh-ed25519 [A-Za-z0-9+/=]+ judrive-live-acceptance$') {
        throw 'Unexpected SSH public key format'
    }
    # Only a public key is transmitted. OpenSSH asks for the VPS password directly.
    & $ssh -p $SshPort -o StrictHostKeyChecking=ask -o ConnectTimeout=10 $Target "umask 077; mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && (grep -qxF '$public' ~/.ssh/authorized_keys || printf '%s\n' '$public' >> ~/.ssh/authorized_keys)"
    Require-Success $LASTEXITCODE 'SSH key installation'
    $identity = @('-i', $keyFile)
} else {
    # Trust is initialized interactively. Check the fingerprint against your VPS control panel.
    & $ssh -p $SshPort -o StrictHostKeyChecking=ask -o ConnectTimeout=10 $Target true
    Require-Success $LASTEXITCODE 'SSH connectivity'
}
$sshArgs = @('-p', "$SshPort") + $verify + $identity
$tunnelArgs = $sshArgs + @('-o','ExitOnForwardFailure=yes','-N','-L',"127.0.0.1:${LocalPort}:127.0.0.1:${VpsPort}",$Target)
if ($TunnelOnly) {
    & $ssh @tunnelArgs
    Require-Success $LASTEXITCODE 'SSH tunnel'
    return
}

if (-not $ReportPath) {
    $ReportPath = Join-Path ([IO.Path]::GetTempPath()) ("judrive-live-" + [Guid]::NewGuid().ToString('N') + ".log")
}
if (Test-Path -LiteralPath $ReportPath) { throw 'Report path already exists' }
$ReportPath = [IO.Path]::GetFullPath($ReportPath)
[Console]::WriteLine("Acceptance report: $ReportPath")

function Join-Arguments([string[]]$Items) {
    return (($Items | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + $_ + '"' } else { $_ }
    }) -join ' ')
}

function Invoke-Stream([string]$Executable, [string[]]$CommandArgs, [string]$Payload) {
    # Only fixed arguments and locally constructed ports/SHA go here. Payload is ASCII over stdin.
    $config = New-Object System.Diagnostics.ProcessStartInfo
    $config.FileName = $Executable
    $config.Arguments = Join-Arguments $CommandArgs
    $config.UseShellExecute = $false
    $config.RedirectStandardInput = $true
    $config.RedirectStandardOutput = $true
    $config.StandardOutputEncoding = [Text.Encoding]::UTF8
    $proc = [System.Diagnostics.Process]::Start($config)
    try {
        $proc.StandardInput.Write($Payload)
        $proc.StandardInput.Close()
        while ($null -ne ($line = $proc.StandardOutput.ReadLine())) {
            if ($line.StartsWith('JUDRIVE_AUDIT_JSON ')) {
                $script:JudriveAudit = $line.Substring(19) | ConvertFrom-Json
            } elseif ($line -match '^JUDRIVE_LOGIN (\S+) (\S+)$') {
                $script:JudriveLogin = @{username = $Matches[1]; password = $Matches[2]}
                [Console]::WriteLine('Private mechanic account (shown once): ' + $Matches[1] + ' / ' + $Matches[2])
            } else {
                [Console]::WriteLine($line)
                [IO.File]::AppendAllText($ReportPath, $line + [Environment]::NewLine, [Text.Encoding]::UTF8)
            }
        }
        $proc.WaitForExit()
        return $proc.ExitCode
    } finally {
        $proc.Dispose()
    }
}

function Encode-Text([string]$Text) {
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Text))
}

$source = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'live_vps.py')))
$manifest = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $repo 'docs/SOURCE_MANIFEST.json')))
$script:JudriveAudit = $null
$script:JudriveLogin = $null

function Invoke-Runner([string[]]$RunArgs, [hashtable]$Values) {
    $encoded = Encode-Text ($Values | ConvertTo-Json -Compress)
    $program = "import base64,json`nexec(compile(base64.b64decode('$source'),'live_vps.py','exec'))`nraise SystemExit(main('$manifest',json.loads(base64.b64decode('$encoded'))))`n"
    return Invoke-Stream $ssh ($sshArgs + @('-T',$Target,'python3','-') + $RunArgs) $program
}

if ($StopRunId) {
    Require-Success (Invoke-Runner @('--stop-run-id',$StopRunId) @{}) 'Stop isolated project'
    return
}

Require-Success (Invoke-Runner @('--audit') @{}) 'VPS read-only audit'
if ($AuditOnly) { return }
if ($null -eq $script:JudriveAudit) { throw 'VPS audit returned no inventory' }

$sha = (& git -C $repo rev-parse HEAD | Select-Object -Last 1).Trim()
Require-Success $LASTEXITCODE 'git rev-parse'
if ($sha -notmatch '^[a-f0-9]{40}$') { throw 'Expected an exact Git commit' }
$dirty = & git -C $repo status --porcelain --untracked-files=no
Require-Success $LASTEXITCODE 'git status'
if ($dirty) { throw 'Use a clean checkout of the published candidate' }

$values = @{}
if ($script:JudriveAudit.missing_materials -and -not $ArchivePath -and -not $script:JudriveAudit.configured_url -and -not $script:JudriveAudit.approved_archive) {
    $asset = Read-Host 'Approved organizer ZIP path or direct HTTPS URL (blank stops)'
    if (-not $asset) { throw 'BLOCKED: approved archive is required' }
    if ($asset -match '^https://') { $values.archive_url = $asset }
    else { $ArchivePath = $asset }
}
if (-not $AudioPath) {
    $AudioPath = Read-Host 'Optional approved audio saying "Proverka dvigatelya tsifrovym mekhanikom" (Russian speech, blank skips STT)'
}
if ($AudioPath) {
    $values.audio_type = [IO.Path]::GetExtension($AudioPath).ToLowerInvariant()
    if ($values.audio_type -notin @('.wav','.webm','.mp4','.m4a','.ogg','.opus','.mp3')) { throw 'Unsupported audio extension' }
}
if (-not $script:JudriveAudit.confirmed_scope) {
    $values.scope = Read-Host 'GigaChat scope from the provider cabinet (GIGACHAT_API_PERS, GIGACHAT_API_B2B, GIGACHAT_API_CORP)'
    if ($values.scope -notin @('GIGACHAT_API_PERS','GIGACHAT_API_B2B','GIGACHAT_API_CORP')) { throw 'A confirmed scope is required' }
}
if ($CaBundle) { $values.ca_uploaded = $true }

$runId = [Guid]::NewGuid().ToString('N')
$stage = "/tmp/judrive-input-$runId"
& $ssh @sshArgs $Target "mkdir -m 700 -- $stage"
Require-Success $LASTEXITCODE 'Private input directory'
function Send-PrivateFile([string]$Path, [string]$RemoteName) {
    $absolute = (Resolve-Path -LiteralPath $Path).ProviderPath
    & $scp -P $SshPort @verify @identity -- $absolute "${Target}:${stage}/${RemoteName}"
    Require-Success $LASTEXITCODE "Upload $RemoteName"
}

$secure = $null
try {
    if ($ArchivePath -and $script:JudriveAudit.missing_materials) { Send-PrivateFile $ArchivePath 'organizer.zip' }
    if ($AudioPath) { Send-PrivateFile $AudioPath 'speech' }
    if ($CaBundle) { Send-PrivateFile $CaBundle 'ca.pem' }
    if ($PromptKey -or -not $script:JudriveAudit.configured_key) {
        $secure = Read-Host 'GigaChat Authorization Key' -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $values.key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
        if (-not $values.key) { throw 'BLOCKED: Authorization Key is required' }
    }
    $runnerArgs = @('--run-id',$runId,'--sha',$sha,'--port',"$VpsPort")
    if ($ConfirmMock) { $runnerArgs += '--confirm-mock' }
    if ($AllowDemoFleet) { $runnerArgs += '--allow-demo-fleet' }
    $result = Invoke-Runner $runnerArgs $values
    if ($result -ne 0) { Write-Warning "LIVE API verification did not finish successfully (exit $result)." }
} finally {
    $values.Remove('key')
    if ($null -ne $secure) { $secure.Dispose() }
    & $ssh @sshArgs $Target "rm -f -- $stage/organizer.zip $stage/speech $stage/ca.pem; rmdir -- $stage"
    if ($LASTEXITCODE -ne 0) { Write-Warning "Private staging cleanup failed: $stage" }
}

[Console]::WriteLine("Browser URL after opening SSH tunnel: http://127.0.0.1:$LocalPort")
$node = Get-Command node.exe -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($script:JudriveLogin -and $node -and $npm) {
    Push-Location $repo
    try {
        if (-not (Test-Path 'node_modules/@playwright/test')) {
            & $npm ci
            Require-Success $LASTEXITCODE 'Install Playwright dependencies'
        }
        & $npm exec -- playwright install chromium
        Require-Success $LASTEXITCODE 'Install Chromium'
        $tunnel = Start-Process -FilePath $ssh -ArgumentList (Join-Arguments $tunnelArgs) -PassThru -NoNewWindow
        try {
            $smoke = Join-Path $PSScriptRoot 'verify-live-browser.cjs'
            $browserArgs = @($smoke, "$LocalPort")
            Require-Success (Invoke-Stream $node.Source $browserArgs (($script:JudriveLogin | ConvertTo-Json -Compress) + "`n")) 'Browser acceptance'
        } finally {
            if (-not $tunnel.HasExited) { $tunnel.Kill() }
            $tunnel.Dispose()
        }
    } finally {
        Pop-Location
        $script:JudriveLogin = $null
    }
} else {
    Write-Warning 'BLOCKED: desktop/mobile browser automation requires Node.js and npm. Use -TunnelOnly.'
}

Require-Success $result 'Isolated LIVE run'
