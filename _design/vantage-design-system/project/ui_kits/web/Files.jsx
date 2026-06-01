/* Files — uploaded file list with type icons, size, action buttons.
   Source uses emoji file icons; we replace with stroke glyphs per brand. */

const FILE_ICON = {
  image: 'companies', // closest stroke for visuals
  pdf:   'note',
  zip:   'files',
  video: 'activity',
  audio: 'activity',
  text:  'note',
  default: 'files',
};

function fileType(contentType) {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (/zip|tar|gz/.test(contentType)) return 'zip';
  if (contentType.startsWith('text/')) return 'text';
  return 'default';
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SEED_FILES = [
  { id: 'f1', name: 'Cobalt-Enterprise-Proposal.pdf',  size: 2_348_944,  type: 'application/pdf',  at: '2h ago'  },
  { id: 'f2', name: 'meridian-onboarding-deck.pdf',    size: 5_184_320,  type: 'application/pdf',  at: '6h ago'  },
  { id: 'f3', name: 'pipeline-snapshot-q2.csv',         size: 18_412,    type: 'text/csv',         at: '1d ago'  },
  { id: 'f4', name: 'logo-cloud.png',                  size: 1_071_147,  type: 'image/png',        at: '3d ago'  },
  { id: 'f5', name: 'prod-postgres-backup-may13.gz',   size: 92_300_512, type: 'application/gzip', at: '6d ago'  },
  { id: 'f6', name: 'team-handbook-v4.pdf',            size: 2_945_120,  type: 'application/pdf',  at: '2w ago'  },
];

function Files() {
  const [files, setFiles] = React.useState(SEED_FILES);
  const [removing, setRemoving] = React.useState(new Set());
  const cols = 'minmax(220px,2.4fr) .7fr 1fr .8fr auto';

  const remove = (id) => {
    setRemoving(s => new Set(s).add(id));
    setTimeout(() => setFiles(fs => fs.filter(f => f.id !== id)), 220);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text2)' }}>{files.length} files</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center',
          padding: '12px 18px', borderBottom: '1px solid var(--border)',
        }}>
          {['Name','Size','Type','Uploaded'].map(h => <Eyebrow key={h}>{h}</Eyebrow>)}
          <span/>
        </div>
        {files.map((f, i) => (
          <FileRow key={f.id} f={f} cols={cols} last={i === files.length - 1} fading={removing.has(f.id)} onDelete={() => remove(f.id)} />
        ))}
      </div>
    </div>
  );
}

function FileRow({ f, cols, last, fading, onDelete }) {
  const [hover, setHover] = React.useState(false);
  const type = fileType(f.type);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center',
        padding: '13px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        opacity: fading ? 0 : 1,
        transition: 'background .12s, opacity .2s', fontSize: 13,
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text2)', flexShrink: 0,
        }}>
          <Icon name={FILE_ICON[type] ?? 'files'} size={15} />
        </span>
        <span style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
      </span>
      <span style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{fmtSize(f.size)}</span>
      <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.type}</span>
      <span style={{ color: 'var(--text2)' }}>{f.at}</span>
      <span style={{ display: 'flex', gap: 6 }}>
        <Button style={{ padding: '4px 10px', fontSize: 12 }}>Download</Button>
        <Button variant="danger" onClick={onDelete} style={{ padding: '4px 10px', fontSize: 12 }}>Delete</Button>
      </span>
    </div>
  );
}

window.Files = Files;
