/** 不允许从 Windows drive/UNC share 根退到无效或不同语义的路径。 */
export function localDirectoryParent(path: string) {
  const root = path.match(/^(?:\\\\\?\\)?[A-Za-z]:[\\/]/)?.[0]
    ?? path.match(/^\\\\(?:\?\\UNC\\)?[^\\]+\\[^\\]+(?:\\|$)/i)?.[0]
    ?? (path.startsWith("/") ? "/" : "");
  const trimmed = path.replace(/[\\/]+$/, "");
  if (trimmed.length <= root.replace(/[\\/]+$/, "").length) return path;
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (index < 0) return path;
  const parent = trimmed.slice(0, index);
  return parent.length < root.length ? root : parent;
}
