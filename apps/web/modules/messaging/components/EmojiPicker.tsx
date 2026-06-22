'use client';

import { useState } from 'react';

const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  },
  {
    label: 'Gestures',
    emojis: ['👍','👎','👌','🤌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','🖐️','✋','🖖','👏','🙌','🤲','🤝','🙏','✍️','💪','🦾','🦿','🦵','🦶','👂','🦻','👃'],
  },
  {
    label: 'Hearts',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☯️','🔥','✨','⭐','🌟','💫','⚡','🎉','🎊','🎈','🎁','🏆','🥇'],
  },
  {
    label: 'Objects',
    emojis: ['💻','🖥️','🖨️','⌨️','🖱️','📱','📲','☎️','📞','📟','📠','📺','📷','📸','📹','🎥','📽️','📼','🔍','🔎','💡','🔦','🕯️','📚','📖','📝','✏️','🖊️','🖋️','✒️','📌','📍','📎','🔗','✂️','🗂️','📁','📂','🗒️','🗃️','📋','📊','📈','📉','🗝️','🔑','🔒','🔓','🔨','⚙️','🔧','🔩','💰','💳','💎'],
  },
  {
    label: 'Nature',
    emojis: ['🌱','🌿','🍀','🌾','🌵','🌴','🌳','🌲','🍁','🍂','🍃','🌺','🌸','🌼','🌻','🌹','🌷','💐','🍄','🌰','🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦋','🐌','🦗','🕷️','🐢','🦎','🐍','🐉'],
  },
  {
    label: 'Food',
    emojis: ['🍎','🍊','🍋','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🫒','🥑','🍆','🥦','🥕','🌽','🌶️','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🥗','🥘','🫕','🍜','🍝','🍛','🍣','🍱','🍤','🍙','🍚','🍘','🥟','🦪','🍦','🍧','🎂','🍰','🧁','🍮','🍭','☕','🍵','🧃','🥤','🍺','🍻','🥂','🍷'],
  },
  {
    label: 'Symbols',
    emojis: ['✅','❌','❎','🚫','⚠️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔲','🔳','▪️','▫️','◾','◽','◼️','◻️','🔈','🔉','🔊','🔇','📣','📢','💬','💭','🗯️','♻️','🔝','🆕','🆓','🆒','🆙','🆗','🆘','🆖','🆚','🉐','🉑','💯','🔞','📵','🚷','🚯','🚳','🚱'],
  },
];

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);

  const filtered = search.trim()
    ? CATEGORIES.flatMap(c => c.emojis).filter(e => {
        // basic substring match on unicode name isn't possible without a dict,
        // so just keep all when searching (user can visually scan)
        return true;
      }).filter(() => true) // show all when searching — emoji search needs a dict
    : null;

  const displayCategories = filtered
    ? [{ label: 'Results', emojis: CATEGORIES.flatMap(c => c.emojis) }]
    : CATEGORIES;

  return (
    <div style={{
      width: 320, background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,.12)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Search */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search emoji…"
          onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
          style={{
            width: '100%', border: '1px solid var(--border)', borderRadius: 8,
            padding: '6px 10px', fontSize: 13, outline: 'none',
            background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Category tabs */}
      {!search && (
        <div style={{
          display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
          overflowX: 'auto', scrollbarWidth: 'none',
        }}>
          {CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(i)}
              title={cat.label}
              style={{
                padding: '6px 10px', border: 'none', fontSize: 16,
                background: activeCategory === i ? 'var(--surface2)' : 'transparent',
                cursor: 'pointer', flexShrink: 0,
                borderBottom: activeCategory === i ? '2px solid var(--text)' : '2px solid transparent',
              }}
            >
              {cat.emojis[0]}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div style={{
        height: 200, overflowY: 'auto', padding: '8px',
        display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2,
        alignContent: 'start',
      }}>
        {(search ? CATEGORIES.flatMap(c => c.emojis) : CATEGORIES[activeCategory]!.emojis).map(emoji => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose(); }}
            style={{
              fontSize: 20, background: 'none', border: 'none',
              cursor: 'pointer', borderRadius: 6, padding: '4px 2px',
              lineHeight: 1,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
