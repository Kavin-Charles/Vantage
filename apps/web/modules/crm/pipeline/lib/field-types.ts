// apps/web/modules/pipeline/lib/field-types.ts
export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'user'
  | 'checkbox'
  | 'url';

export interface FieldTypeMeta {
  label: string;
  inputType: string;
  canFilter: boolean;
  canSort: boolean;
}

export const FIELD_TYPE_META: Record<FieldType, FieldTypeMeta> = {
  text:        { label: 'Text',         inputType: 'text',     canFilter: true,  canSort: true  },
  number:      { label: 'Number',       inputType: 'number',   canFilter: true,  canSort: true  },
  date:        { label: 'Date',         inputType: 'date',     canFilter: true,  canSort: true  },
  select:      { label: 'Select',       inputType: 'select',   canFilter: true,  canSort: false },
  multiselect: { label: 'Multi-select', inputType: 'select',   canFilter: true,  canSort: false },
  user:        { label: 'User',         inputType: 'select',   canFilter: true,  canSort: false },
  checkbox:    { label: 'Checkbox',     inputType: 'checkbox', canFilter: true,  canSort: false },
  url:         { label: 'URL',          inputType: 'url',      canFilter: false, canSort: false },
};

export const FIELD_TYPES = Object.keys(FIELD_TYPE_META) as FieldType[];

export function formatFieldValue(
  value: unknown,
  type: FieldType,
  options?: { label: string; value: string }[],
): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'checkbox':
      return value ? '✓' : '✗';
    case 'date':
      return value ? new Date(value as string).toLocaleDateString() : '—';
    case 'select': {
      const opt = options?.find(o => o.value === value);
      return opt?.label ?? String(value);
    }
    case 'multiselect': {
      const vals = Array.isArray(value) ? (value as string[]) : [];
      return vals.map(v => options?.find(o => o.value === v)?.label ?? v).join(', ') || '—';
    }
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : String(value);
    default:
      return String(value);
  }
}
