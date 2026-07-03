export function isValidVersion(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v);
}

export function rewriteEnvVersion(content: string, newVersion: string): string {
  const lines = content.split('\n');
  const currentLine = lines.find(l => l.startsWith('VENCORE_VERSION='));
  const current = currentLine ? currentLine.slice('VENCORE_VERSION='.length).trim() : null;

  const kept = lines.filter(
    l => !l.startsWith('VENCORE_VERSION=') && !l.startsWith('VENCORE_PREVIOUS_VERSION='),
  );
  while (kept.length > 0 && kept.at(-1) === '') kept.pop();

  if (current !== null && current !== '') kept.push(`VENCORE_PREVIOUS_VERSION=${current}`);
  kept.push(`VENCORE_VERSION=${newVersion}`);
  kept.push('');
  return kept.join('\n');
}
