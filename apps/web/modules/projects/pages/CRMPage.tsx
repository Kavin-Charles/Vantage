'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type CRMContact, type CRMCompany, type CRMItem } from '@/modules/projects/lib/api';

// ─── Design tokens ────────────────────────────────────────────────────────────

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
  return { ...pill, ...(map[status] ?? map['cold']!) };
};

const sectionHead: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
  color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px',
};

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20,
};

const inputStyle: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 13, padding: '8px 10px',
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', outline: 'none', width: '100%', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
  color: 'var(--text2)', marginBottom: 6, display: 'block',
};

const kv = (label: string, value: string | null | undefined) =>
  value ? (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', minWidth: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)' }}>{value}</span>
    </div>
  ) : null;

// ─── Combobox ─────────────────────────────────────────────────────────────────

interface ComboOption { id: string; label: string; sublabel?: string }

function Combobox({
  placeholder, value, onSelect, onClear, fetchOptions,
}: {
  placeholder: string;
  value: { id: string; label: string } | null;
  onSelect: (opt: ComboOption) => void;
  onClear: () => void;
  fetchOptions: (q: string) => Promise<ComboOption[]>;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setOptions([]); return; }
    setLoading(true);
    try { setOptions(await fetchOptions(q)); }
    finally { setLoading(false); }
  }, [fetchOptions]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void search(query), 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, search]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', flex: 1 }}>{value.label}</span>
        <button
          type="button"
          onClick={onClear}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
          title="Remove"
        >×</button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={inputStyle}
      />
      {open && (query.length > 0) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          marginTop: 4, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        }}>
          {loading && (
            <div style={{ padding: '10px 12px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>Searching…</div>
          )}
          {!loading && options.length === 0 && (
            <div style={{ padding: '10px 12px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>No results</div>
          )}
          {!loading && options.map(opt => (
            <button
              key={opt.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(opt); setQuery(''); setOpen(false); setOptions([]); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{opt.label}</div>
              {opt.sublabel && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{opt.sublabel}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CRM record display cards ──────────────────────────────────────────────────

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

// ─── Activity timeline ────────────────────────────────────────────────────────

type ActivityEntry = { id: string; type: string; body: string | null; created_at: string };

const ACTIVITY_ICONS: Record<string, string> = {
  email: '✉', call: '📞', note: '📝', meeting: '🗓', deal_change: '💼',
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
  if (activities.length === 0) return <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>No activity recorded for this contact yet.</div>;

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

// ─── Link form with comboboxes ─────────────────────────────────────────────────

type Selection = { id: string; label: string } | null;

function LinkCRMForm({ projectId, current }: {
  projectId: string;
  current: { contact_id?: string | null; contact_name?: string | null; company_id?: string | null; company_name?: string | null; source_item_id?: string | null; item_name?: string | null };
}) {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const [contact, setContact] = useState<Selection>(
    current.contact_id ? { id: current.contact_id, label: current.contact_name ?? current.contact_id } : null
  );
  const [company, setCompany] = useState<Selection>(
    current.company_id ? { id: current.company_id, label: current.company_name ?? current.company_id } : null
  );
  const [item, setItem] = useState<Selection>(
    current.source_item_id ? { id: current.source_item_id, label: current.item_name ?? current.source_item_id } : null
  );
  const [flash, setFlash] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return pmApi.updateProject(token, projectId, {
        contact_id: contact?.id ?? null,
        company_id: company?.id ?? null,
        source_item_id: item?.id ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['project-crm-activity', projectId] });
      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
    },
  });

  // Provider-aware search: routes through whichever CRM provider the hook is
  // configured with (builtin or plugin). Falls back to legacy core search
  // ONLY when the provider-aware endpoint is expectedly unavailable (hook
  // disabled → 403 HOOK_DISABLED, or older API without the route → 404).
  // Real failures (500s, network) rethrow so they surface instead of being
  // masked by a silent fallback.
  const isExpectedCrmSearchMiss = (e: unknown): boolean => {
    const msg = e instanceof Error ? e.message : String(e);
    return /hook is not enabled|HOOK_DISABLED|HTTP 40[34]|not found/i.test(msg);
  };

  const fetchContacts = useCallback(async (q: string): Promise<ComboOption[]> => {
    const token = await getToken();
    try {
      const res = await pmApi.searchCrm(token, 'contact', q);
      return (res.data ?? []).map(c => ({ id: c.id, label: c.label, sublabel: c.sublabel ?? undefined }));
    } catch (e) {
      if (!isExpectedCrmSearchMiss(e)) throw e;
      const res = await pmApi.searchContacts(token, q);
      return (res.data ?? []).map(c => ({ id: c.id, label: c.name, sublabel: c.email }));
    }
  }, [getToken]);

  const fetchCompanies = useCallback(async (q: string): Promise<ComboOption[]> => {
    const token = await getToken();
    try {
      const res = await pmApi.searchCrm(token, 'company', q);
      return (res.data ?? []).map(c => ({ id: c.id, label: c.label, sublabel: c.sublabel ?? undefined }));
    } catch (e) {
      if (!isExpectedCrmSearchMiss(e)) throw e;
      const res = await pmApi.searchCompanies(token, q);
      return (res.data ?? []).map(c => ({ id: c.id, label: c.name, sublabel: c.industry ?? undefined }));
    }
  }, [getToken]);

  const fetchItems = useCallback(async (q: string): Promise<ComboOption[]> => {
    const token = await getToken();
    try {
      const res = await pmApi.searchCrm(token, 'deal', q);
      return (res.data ?? []).map(d => ({ id: d.id, label: d.label, sublabel: d.sublabel ?? undefined }));
    } catch (e) {
      if (!isExpectedCrmSearchMiss(e)) throw e;
      const res = await pmApi.searchItems(token, q);
      return (res.data ?? []).map(i => ({
        id: i.id,
        label: (i.field_values['name'] as string | undefined) ?? i.id,
        sublabel: `${i.pipeline_name} → ${i.stage_name}`,
      }));
    }
  }, [getToken]);

  return (
    <div style={card}>
      <p style={sectionHead}>Link CRM Records</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Contact</label>
          <Combobox
            placeholder="Search contacts by name or email…"
            value={contact}
            onSelect={opt => setContact(opt)}
            onClear={() => setContact(null)}
            fetchOptions={fetchContacts}
          />
        </div>
        <div>
          <label style={labelStyle}>Company</label>
          <Combobox
            placeholder="Search companies by name…"
            value={company}
            onSelect={opt => setCompany(opt)}
            onClear={() => setCompany(null)}
            fetchOptions={fetchCompanies}
          />
        </div>
        <div>
          <label style={labelStyle}>Pipeline Deal</label>
          <Combobox
            placeholder="Search deals by name…"
            value={item}
            onSelect={opt => setItem(opt)}
            onClear={() => setItem(null)}
            fetchOptions={fetchItems}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => mutation.mutate()}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

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

  const crmContact = project?.crm_contact as CRMContact | null;
  const crmCompany = project?.crm_company as CRMCompany | null;
  const crmItem = project?.crm_item as CRMItem | null;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', margin: '0 0 24px' }}>
        CRM Integration
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        {/* Left: linked record cards + link form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {crmContact
            ? <ContactCard contact={crmContact} />
            : !project?.contact_id && (
              <div style={{ ...card, color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 13, fontStyle: 'italic' }}>
                No contact linked.
              </div>
            )
          }
          {crmCompany && <CompanyCard company={crmCompany} />}
          {crmItem && <DealCard item={crmItem} />}

          <LinkCRMForm
            projectId={projectId}
            current={{
              contact_id: project?.contact_id,
              contact_name: crmContact?.name,
              company_id: project?.company_id,
              company_name: crmCompany?.name,
              source_item_id: project?.source_item_id,
              item_name: crmItem ? ((crmItem.field_values['name'] as string | undefined) ?? undefined) : undefined,
            }}
          />
        </div>

        {/* Right: activity timeline */}
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
