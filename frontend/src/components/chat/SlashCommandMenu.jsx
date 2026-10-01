import { SLASH_LISTBOX_ID, slashOptionId } from './useSlashCommands.js';

export default function SlashCommandMenu({ filteredCommands, slashIndex, executeCommand }) {
  return (
    <div id={SLASH_LISTBOX_ID} role="listbox" aria-label="命令" className="we-menu we-chat-slash-dropdown">
      {filteredCommands.map((c, i) => (
        <button
          key={c.cmd}
          id={slashOptionId(i)}
          type="button"
          role="option"
          aria-selected={i === slashIndex}
          tabIndex={-1}
          onMouseDown={(e) => { e.preventDefault(); executeCommand(c.cmd); }}
          className={`we-menu__item${i === slashIndex ? ' is-active' : ''}`}
        >
          <span className="we-chat-slash-item__cmd">{c.cmd}</span>
          <span className="we-menu__hint">{c.desc}</span>
        </button>
      ))}
    </div>
  );
}
