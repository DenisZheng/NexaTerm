# 仅安装开发/CI 审计工具；版本与官方安装包 SHA256 在 security-tools.json 固定。
param(
    [Parameter(Mandatory)][ValidateSet('gitleaks', 'cargo-deny')][string]$Tool,
    [Parameter(Mandatory)][string]$Destination
)
$ErrorActionPreference = 'Stop'
$platform = if ($IsWindows) { 'windows-x64' } elseif ($IsLinux) { 'linux-x64' } else { throw '暂不支持此安装平台，请手动安装固定版本。' }
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') { throw '此安装器仅支持 x64。' }
$config = Get-Content -Raw (Join-Path $PSScriptRoot 'security-tools.json') | ConvertFrom-Json
$spec = $config.$Tool
$asset = $spec.assets.$platform
$directory = Join-Path $Destination "$Tool-$($spec.version)"
New-Item -ItemType Directory -Force $directory | Out-Null
$archive = Join-Path $directory $asset.name
$url = "https://github.com/$($spec.repository)/releases/download/$($spec.tag)/$($asset.name)"
Invoke-WebRequest -Uri $url -OutFile $archive -TimeoutSec 120
if ((Get-FileHash -Algorithm SHA256 $archive).Hash.ToLowerInvariant() -ne $asset.sha256) {
    Remove-Item $archive
    throw '安装包 SHA256 不匹配，拒绝执行。'
}
if ($asset.name.EndsWith('.zip')) {
    Expand-Archive -Path $archive -DestinationPath $directory -Force
} else {
    & tar -xzf $archive -C $directory
    if ($LASTEXITCODE -ne 0) { throw '安装包解压失败。' }
}
Remove-Item $archive
$binaryName = if ($IsWindows) { "$Tool.exe" } else { $Tool }
$binaries = @(Get-ChildItem $directory -Recurse -File | Where-Object Name -EQ $binaryName)
if ($binaries.Count -ne 1) { throw '安装包中未找到唯一工具二进制。' }
if ($env:GITHUB_PATH) {
    [System.IO.File]::AppendAllText($env:GITHUB_PATH, "$($binaries[0].DirectoryName)`n", [System.Text.UTF8Encoding]::new($false))
}
Write-Output "PASS: 已安装 $Tool $($spec.version)，官方安装包 SHA256 已验证。"
