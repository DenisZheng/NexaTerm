# Node 在 Windows 上不能以 shell:false 直接启动 pnpm.cmd。
# 使用固定参数的 PowerShell 适配层，不拼接调用方输入，不依赖 npm_execpath。
param([switch]$Version)
$ErrorActionPreference = 'Stop'
if ($Version) {
    & pnpm --version
} else {
    & pnpm --registry=https://registry.npmjs.org audit --json
}
exit $LASTEXITCODE
