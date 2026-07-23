export type DealPriority = 'low' | 'medium' | 'high' | 'urgent';

export function deriveDealPriority(probability: number): DealPriority {
  if (probability >= 80) return 'urgent';
  if (probability >= 60) return 'high';
  if (probability >= 30) return 'medium';
  return 'low';
}
