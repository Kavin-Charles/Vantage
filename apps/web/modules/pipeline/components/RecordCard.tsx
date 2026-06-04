import type { PipelineRecordWithValues, RecordTypeField } from '@vencore/types';

function getFieldValue(record: PipelineRecordWithValues, fields: RecordTypeField[], label: string): unknown {
  const field = fields.find(f => f.label.toLowerCase() === label.toLowerCase());
  if (!field) return null;
  return record.field_values.find(v => v.field_id === field.id)?.value ?? null;
}

export function RecordCard({
  record,
  fields,
  ownerName,
  contactName,
  onClick,
  dragging,
}: {
  record: PipelineRecordWithValues;
  fields: RecordTypeField[];
  ownerName?: string;
  contactName?: string;
  onClick: () => void;
  dragging?: boolean;
}) {
  const valueRaw = getFieldValue(record, fields, 'value');
  const fmtValue = valueRaw != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(valueRaw))
    : null;

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 14px',
        cursor: 'pointer',
        opacity: dragging ? 0.5 : 1,
        userSelect: 'none',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
    >
      {record.record_number && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontFamily: 'DM Sans, sans-serif' }}>
          {record.record_number}
        </div>
      )}
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', fontFamily: 'DM Sans, sans-serif', marginBottom: 6, lineHeight: '1.3' }}>
        {record.name}
      </div>
      {(contactName || fmtValue) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          {contactName && (
            <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {contactName}
            </span>
          )}
          {fmtValue && (
            <span style={{ fontSize: 13, fontFamily: 'Instrument Serif, serif', color: 'var(--text)', flexShrink: 0 }}>
              {fmtValue}
            </span>
          )}
        </div>
      )}
      {ownerName && (
        <div style={{ marginTop: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: '50%',
            background: 'var(--surface2)', fontSize: 11, color: 'var(--text2)',
            fontFamily: 'DM Sans, sans-serif', border: '1px solid var(--border)',
            fontWeight: 600,
          }}>
            {ownerName.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}
