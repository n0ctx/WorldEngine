import { useRef, useState } from 'react';
import { CastColumn } from '../../CharactersPage/components/CastColumn.jsx';
import { RulesEntryCard } from '../../CharactersPage/components/RulesEntryCard.jsx';
import { StorylineColumn } from '../../CharactersPage/components/StorylineColumn.jsx';
import VisualSection from '../VisualSection.jsx';
import { CAST, STORYLINES } from '../demos/fixtures.js';

const noop = () => {};
const CHARACTERS_BY_ID = Object.fromEntries(CAST.map((character) => [character.id, character]));

export function EntryColsDemo() {
  const importRef = useRef(null);
  const [characters, setCharacters] = useState(CAST);
  return (
    <VisualSection id="entry-cols">
      <div className="we-worldhub-layout we-design-lab__cols we-design-lab__desk">
        <StorylineColumn
          loading={false}
          timeline={STORYLINES}
          charactersById={CHARACTERS_BY_ID}
          onCreateStoryline={noop}
          onStorylineClick={noop}
          onStorylineDelete={noop}
        />
        <CastColumn
          worldId="lab"
          navigate={noop}
          location={null}
          loading={false}
          characters={characters}
          setCharacters={setCharacters}
          onReorderEnd={noop}
          importingChar={false}
          charImportRef={importRef}
          onImportCharFile={noop}
          onCharacterClick={noop}
          setDeletingChar={noop}
        />
        <div className="we-worldhub-side">
          <div className="we-worldhub-section">
            <div className="we-worldhub-section-header">
              <span className="we-worldhub-section-title">世界规则</span>
            </div>
            <RulesEntryCard entryCount={12} fieldCount={5} onOpen={noop} />
          </div>
        </div>
      </div>
    </VisualSection>
  );
}
