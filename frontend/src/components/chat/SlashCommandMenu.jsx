import { SLASH_LISTBOX_ID, slashOptionId } from './useSlashCommands.js';

export default function SlashCommandMenu({ filteredCommands, slashIndex, executeCommand }) {
  return (
    <div id={SLASH_LISTBOX_ID} role="listbox" aria-label="命令" className="we-chat-slash-dropdown">
      {filteredCommands.map((c, i) => (
        <button
          key={c.cmd}
          id={slashOptionId(i)}
          type="button"
          role="option"
          aria-selected={i === slashIndex}
          tabIndex={-1}
          onMouseDown={(e) => { e.preventDefault(); executeCommand(c.cmd); }}
          className={`we-chat-slash-item${i === slashIndex ? ' we-chat-slash-item--active' : ''}`}
        >
          <span className="we-chat-slash-item__cmd">{c.cmd}</span>
          <span className="we-chat-slash-item__desc">{c.desc}</span>
        </button>
      ))}
    </div>
  );
}
