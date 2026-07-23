import type { ContactStatus } from '@vencore/types';

export type BadgeTone = 'blue' | 'gold' | 'neutral' | 'red';

export function statusToBadgeTone(status: ContactStatus): BadgeTone {
  switch (status) {
    case 'customer':
      return 'blue';
    case 'prospect':
      return 'gold';
    case 'cold':
      return 'neutral';
    case 'churned':
      return 'red';
  }
}

export function statusLabel(status: ContactStatus): string {
  switch (status) {
    case 'customer':
      return 'Active';
    case 'prospect':
      return 'Lead';
    case 'cold':
      return 'Dormant';
    case 'churned':
      return 'Churned';
  }
}
