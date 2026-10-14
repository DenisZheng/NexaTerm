import { describe, expect, it } from "vitest";
import { isSensitiveCommand, shouldPauseMacroCapture } from "./commandPrivacy";

describe("known command privacy patterns", () => {
  it.each([
    "passwd", "sshpass -p synthetic-marker ssh example.invalid", "sudo -S id",
    "mysql -psynthetic-marker", "redis-cli -p synthetic-marker", "export SERVICE_TOKEN=synthetic-marker",
    "PASSWORD = 'synthetic-marker'", "curl --password synthetic-marker example.invalid",
    "tool --auth-token=synthetic-marker", "tool --client-secret synthetic-marker",
    "tool --api-key synthetic-marker", "curl --oauth2-bearer synthetic-marker example.invalid",
    "curl -H 'Authorization: Bearer synthetic-marker' example.invalid",
    'curl -H "Authorization: Basic synthetic-marker" example.invalid',
    "curl https://user:synthetic-marker@example.invalid", "curl https://synthetic-marker@example.invalid",
    "curl -u user:synthetic-marker example.invalid", "wget --user=user --password=synthetic-marker example.invalid",
    "cmdkey /generic:fixture /pass:synthetic-marker", 'ConvertTo-SecureString "synthetic-marker" -AsPlainText',
    'Set-Secret fixture "synthetic-marker"', "security add-generic-password -s fixture -w synthetic-marker",
    "curl -H 'Cookie: session=synthetic-marker' example.invalid",
  ])("excludes %s from automatic history and pauses recording", (command) => {
    expect(isSensitiveCommand(command)).toBe(true); expect(shouldPauseMacroCapture(command)).toBe(true);
  });
  it.each(["pwd", "ls -la", "printf 'fixture'", "git status", "curl https://example.invalid/health", "Get-Location"])("keeps ordinary command %s", (command) => {
    expect(isSensitiveCommand(command)).toBe(false); expect(shouldPauseMacroCapture(command)).toBe(false);
  });
  it.each(["sudo apt update", "su fixture", "ssh example.invalid", "sftp example.invalid", "psql", "aws configure", "az login", "read -s answer"])("pauses before possible authentication prompt %s", (command) => {
    expect(shouldPauseMacroCapture(command)).toBe(true);
  });
});
