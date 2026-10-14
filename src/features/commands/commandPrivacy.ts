/** 已知模式的保守过滤，不证明未知命令不含秘密。禁止记录匹配值。 */
export function isSensitiveCommand(command: string): boolean {
  return /\b(?:passwd|sshpass)\b/i.test(command)
    || /\bsudo\s+-S\b/i.test(command)
    || /\b(?:mysql|mariadb|psql|redis-cli)\b[^\n\r]*\s-p(?:\S+)?/i.test(command)
    || /\b[\w-]*(?:password|passwd|token|secret|access[_-]?key|api[_-]?key|private[_-]?key)[\w-]*\s*=/i.test(command)
    || /(?:^|\s)--?(?:[\w-]*[_-])?(?:password|passwd|passphrase|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|pw|oauth2-bearer)(?:\b|=)/i.test(command)
    || /\bauthorization\b["']?\s*[:=]\s*["']?\s*(?:basic|bearer)\b/i.test(command)
    || /\b[a-z][\w+.-]*:\/\/[^\s/@]+(?::[^\s/@]*)?@/i.test(command)
    || /\b(?:curl|wget)\b[^\r\n]*\s(?:-u\b|--user(?:\s|=))/i.test(command)
    || /\b(?:cmdkey|convertto-securestring|set-secret)\b/i.test(command)
    || /\bsecurity\s+(?:add|find)-(?:generic|internet)-password\b/i.test(command)
    || /\b(?:cookie|set-cookie)\b["']?\s*:\s*\S/i.test(command);
}

/** 可能进入认证提示的命令也暂停宏采集，避免随后显式发送的认证回答被纳入。 */
export function shouldPauseMacroCapture(command: string): boolean {
  return isSensitiveCommand(command)
    || /(?:^|[\s;|&])(?:sudo|su|ssh|sftp|login|mysql|mariadb|psql|redis-cli)(?:\s|$)/i.test(command)
    || /\b(?:read\s+-s|aws\s+configure|gcloud\s+auth|az\s+login|getpass)\b/i.test(command);
}
