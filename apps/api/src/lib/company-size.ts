export type SizeBand = 'startup' | 'smb' | 'mid' | 'enterprise';

/** Buckets a company's employee count into a coarse size band for filtering/display. */
export function sizeBand(employeeCount: number | null): SizeBand {
  if (employeeCount == null) return 'smb';
  if (employeeCount >= 1000) return 'enterprise';
  if (employeeCount >= 200) return 'mid';
  if (employeeCount >= 20) return 'smb';
  return 'startup';
}
