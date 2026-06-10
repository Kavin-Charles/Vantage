'use client';

interface Props {
  name: string;
  isAdmin: boolean;
  isEditMode: boolean;
  onToggleEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onOpenGroupAssign: () => void;
  onAddWidget: () => void;
  isSaving: boolean;
}

export function DashboardHeader({
  name,
  isAdmin,
  isEditMode,
  onToggleEdit,
  onSave,
  onCancel,
  onOpenGroupAssign,
  onAddWidget,
  isSaving,
}: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 28px 16px',
        borderBottom: isEditMode ? '2px dashed var(--border)' : 'none',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          color: 'var(--text)',
        }}
      >
        {name}
      </h1>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {isAdmin && isEditMode && (
          <>
            <button
              onClick={onAddWidget}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              + Add Widget
            </button>
            <button
              onClick={onOpenGroupAssign}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text2)',
              }}
            >
              Groups
            </button>
            <button
              onClick={onCancel}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text2)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--text)',
                color: '#fff',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              {isSaving ? 'Saving…' : 'Save Layout'}
            </button>
          </>
        )}
        {isAdmin && !isEditMode && (
          <button
            onClick={onToggleEdit}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            Edit Layout
          </button>
        )}
      </div>
    </div>
  );
}
