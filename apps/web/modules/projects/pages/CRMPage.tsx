'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type CRMContact, type CRMCompany, type CRMItem } from '@/modules/projects/lib/api';

const pill: React.CSSProperties = {
  display: 'inline-block', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
  padding: '2px 8px', borderRadius: 20,
};

const contactStatusStyle = (status: string): React.CSSProperties => {
  const map: Record<string, React.CSSProperties> = {
    prospect: { background: 'var(--blue-bg)', color: 'var(--blue)' },
    customer:  { background: 'var(--green-bg)', color: 'var(--green)' },
    cold:      { background: 'var(--surface2)', color: 'var(--text2)' },
    churned:   { background: 'var(--red-bg)', color: 'var(--red)' },
  };
  return { ...pill, ...(map[status] ?? map['cold']) };
};

const sectionHead: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
  color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px',
};

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20,
};

const kv = (label: string, value: string | null | undefined) =>
  value ? (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', minWidth: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)' }}>{value}</span>
    </div>
  ) : null;

function ContactCard({ contact }: { contact: CRMContact }) {
  return (
    <div style={card}>
      <p style={sectionHead}>Linked Contact</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Instrument Serif', fontSize: 16, color: 'var(--text2)', flexShrink: 0 }}>
          {contact.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p style={{ fontFamily: 'Instrument Serif', fontSize: 16, color: 'var(--text)', margin: 0 }}>{contact.name}</p>
          <span style={contactStatusStyle(contact.status)}>{contact.status}</span>
        </div>
      </div>
      {kv('Email', contact.email)}
      {kv('Phone', contact.phone)}
      {kv('Last contacted', contact.last_contacted_at ? new Date(contact.last_contacted_at).toLocaleDateString() : null)}
    </div>
  );
}

function CompanyCard({ company }: { company: CRMCompany }) {
  return (
    <div style={card}>
      <p style={sectionHead}>Linked Company</p>
      <p style={{ fontFamily: 'Instrument Serif', fontSize: 16, color: 'var(--text)', margin: '0 0 12px' }}>{company.name}</p>
      {kv('Industry', company.industry)}
      {kv('Location', company.location)}
      {kv('Website', company.website)}
      {kv('Employees', company.employee_count != null ? String(company.employee_count) : null)}
    </div>
  );
}

function DealCard({ item }: { item: CRMItem }) {
  const fields = item.field_values as Record<string, unknown>;
  const name = (fields['name'] ?? fields['title'] ?? 'Untitled deal') as string;
  const value = fields['value'] as string | number | undefined;
  return (
    <div style={card}>
      <p style={sectionHead}>Pipeline Deal</p>
      <p style={{ fontFamily: 'Instrument Serif', fontSize: 16, color: 'var(--text)', margin: '0 0 12px' }}>{name}</p>
      {value != null && kv('Value', `$${Number(value).toLocaleString()}`)}
    </div>
  );
}

type ActivityEntry = {
  id: string;
  type: string;
  body: string | null;
  created_at: string;
};

const ACTIVITY_ICONS: Record<string, string> = {
  email: '✉',
  call: '📞',
  note: '📝',
  meeting: '🗓',
  deal_change: '💼',
};

function ActivityFeed({ projectId }: { projectId: string }) {
  const getToken = useApiToken();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['project-crm-activity', projectId],
    queryFn: async () => {
      const token = await getToken();
      return pmApi.getCRMActivity(token, projectId);
    },
  });

  if (isLoading) return <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', padding: 16 }}>Loading activity…</div>;
  if (isError) return <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', padding: 16 }}>Activity timeline not available — enable the <strong>client_activity_timeline</strong> hook in Hooks settings.</div>;

  const activities = (data?.data ?? []) as ActivityEntry[];
  if (activities.length === 0) {
    return <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>No activity recorded for this contact yet.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {activities.map((a, i) => (
        <div key={a.id} style={{ display: 'flex', gap: 12, paddingBottom: i < activities.length - 1 ? 16 : 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
              {ACTIVITY_ICONS[a.type] ?? '•'}
            </div>
            {i < activities.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
          </div>
          <div style={{ paddingTop: 4, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>{a.type.replace('_', ' ')}</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)' }}>{new Date(a.created_at).toLocaleDateString()}</span>
            </div>
            {a.body && <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.6 }}>{a.body}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

type LinkForm = { contact_id: string; company_id: string; source_item_id: string };

function LinkCRMForm({ projectId, current }: { projectId: string; current: { contact_id?: string | null; company_id?: string | null; source_item_id?: string | null } }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [form, setForm] = useState<LinkForm>({
    contact_id: current.contact_id ?? '',
    company_id: current.company_id ?? '',
    source_item_id: current.source_item_id ?? '',
  });
  const [flash, setFlash] = useState(false);

  const mutation = useMutation({
    mutationFn: async (body: Partial<LinkForm>) => {
      const token = await getToken();
      return pmApi.updateProject(token, projectId, {
        contact_id: body.contact_id || null,
        company_id: body.company_id || null,
        source_item_id: body.source_item_id || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['project-crm-activity', projectId] });
      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
    },
  });

  const inputStyle: React.CSSProperties = {
    fontFamily: 'DM Sans', fontSize: 13, padding: '8px 10px',
    borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
    color: 'var(--text2)', marginBottom: 6, display: 'block',
  };

  return (
    <div style={card}>
      <p style={sectionHead}>Link CRM Records</p>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: '0 0 16px' }}>
        Paste the UUID of the contact, company, or pipeline item to link. Requires the respective hooks to be enabled.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={labelStyle}>Contact ID</label>
          <input
            value={form.contact_id}
            onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}
            placeholder="uuid…"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Company ID</label>
          <input
            value={form.company_id}
            onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
            placeholder="uuid…"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Pipeline Item ID</label>
          <input
            value={form.source_item_id}
            onChange={e => setForm(f => ({ ...f, source_item_id: e.target.value }))}
            placeholder="uuid…"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => mutation.mutate(form)}
            disabled={mutation.isPending}
            style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            {mutation.isPending ? 'Saving…' : 'Save Links'}
          </button>
          {flash && <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--green)' }}>Saved</span>}
          {mutation.isError && <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--red)' }}>Failed to save.</span>}
        </div>
      </div>
    </div>
  );
}

export default function CRMPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();

  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const token = await getToken();
      return pmApi.getProject(token, projectId);
    },
  });

  const project = data?.data;

  if (isLoading) {
    return <div style={{ padding: 24, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>Loading…</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', margin: '0 0 24px' }}>
        CRM Integration
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        {/* Left column: linked records */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {project?.crm_contact
            ? <ContactCard contact={project.crm_contact as CRMContact} />
            : !project?.contact_id && (
              <div style={{ ...card, color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 13, fontStyle: 'italic' }}>
                No contact linked.
              </div>
            )
          }
          {project?.crm_company && <CompanyCard company={project.crm_company as CRMCompany} />}
          {project?.crm_item && <DealCard item={project.crm_item as CRMItem} />}

          {/* Link form */}
          <LinkCRMForm
            projectId={projectId}
            current={{
              contact_id: project?.contact_id,
              company_id: project?.company_id,
              source_item_id: project?.source_item_id,
            }}
          />
        </div>

        {/* Right column: activity timeline */}
        <div style={card}>
          <p style={sectionHead}>Contact Activity Timeline</p>
          {project?.contact_id
            ? <ActivityFeed projectId={projectId} />
            : <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Link a contact to see their activity here.</div>
          }
        </div>
      </div>
    </div>
  );
}
