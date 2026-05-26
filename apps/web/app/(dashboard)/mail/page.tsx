'use client';

import { useState, useEffect } from 'react';
import { Topbar } from '@/components/Topbar';
import { FolderSidebar } from '@/components/mail/FolderSidebar';
import { EmailList } from '@/components/mail/EmailList';
import { EmailDetail } from '@/components/mail/EmailDetail';
import { ComposeModal } from '@/components/mail/ComposeModal';
import { apiFetch } from '@/lib/api';

type Folder = 'inbox' | 'sent' | 'starred' | 'trash';

interface Email {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  body_html: string | null;
  body_text: string | null;
  sent_at: string;
  contact_id: string | null;
  is_starred: boolean;
  is_read: boolean;
  account_id: string;
  message_id: string;
}

interface Account { id: string; email: string; }

export default function MailPage() {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<Folder>('inbox');
  const [search, setSearch] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [replyTo, setReplyTo] = useState<{ account_id: string; to: string; subject: string; message_id: string } | undefined>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [listKey, setListKey] = useState(0);

  useEffect(() => {
    void apiFetch<{ data: Account[] }>('/api/mail/accounts')
      .then(j => setAccounts(j.data ?? []))
      .catch(() => setAccounts([]));
  }, []);

  function handleReply(email: Email) {
    setReplyTo({
      account_id: email.account_id,
      to: email.from_address,
      subject: email.subject ?? '',
      message_id: email.message_id,
    });
    setShowCompose(true);
  }

  // 'starred' is a filter on inbox, not a separate folder on the server
  const apiFolder = selectedFolder === 'starred' ? 'inbox' : selectedFolder;

  return (
    <>
      <Topbar />
      <div style={{ display: 'flex', height: 'calc(100dvh - var(--header-h))', overflow: 'hidden', background: 'var(--bg)' }}>
        <FolderSidebar
          selectedAccount={selectedAccount}
          selectedFolder={selectedFolder}
          onAccountChange={setSelectedAccount}
          onFolderChange={setSelectedFolder}
          onCompose={() => { setReplyTo(undefined); setShowCompose(true); }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <input
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--surface2)', color: 'var(--text)', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <EmailList
              key={listKey}
              accountId={selectedAccount}
              folder={apiFolder}
              search={search}
              selectedId={selectedEmail?.id ?? null}
              onlyStarred={selectedFolder === 'starred'}
              onSelect={(email) => setSelectedEmail(email as unknown as Email)}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)' }}>
          {selectedEmail ? (
            <EmailDetail
              email={selectedEmail}
              onReply={handleReply}
              onClose={() => setSelectedEmail(null)}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 13 }}>
              Select an email to read
            </div>
          )}
        </div>
      </div>

      {showCompose && (
        <ComposeModal
          accounts={accounts}
          replyTo={replyTo}
          onClose={() => setShowCompose(false)}
          onSent={() => { setSelectedEmail(null); setSelectedFolder('sent'); setListKey(k => k + 1); }}
        />
      )}
    </>
  );
}
