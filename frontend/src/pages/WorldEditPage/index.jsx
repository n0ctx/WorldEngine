import { useLocation, useNavigate, useParams } from 'react-router-dom';
import EditPageShell from '../layout/EditPageShell';
import useWorldAppearance from './useWorldAppearance.js';
import useWorldEditPage from './useWorldEditPage.js';
import WorldEditSections from './WorldEditSections.jsx';
import WorldCardPreview from './WorldCardPreview.jsx';

export default function WorldEditPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  const isCreate = !worldId;
  const appearance = useWorldAppearance(worldId);
  const page = useWorldEditPage({
    worldId,
    isCreate,
    isOverlay,
    navigate,
    onWorldLoaded: appearance.onWorldLoaded,
  });

  return (
    <EditPageShell
      loading={page.loading}
      loadError={page.loadError}
      onRetry={page.retryLoad}
      dirty={page.dirty}
      onClose={page.handleClose}
      save={{
        creating: isCreate,
        saving: page.saving,
        error: page.saveError,
        savedKey: page.savedKey,
        saveLabel: isCreate ? '创建世界' : '保存',
        onSave: page.handleSave,
      }}
      title={isCreate ? '新建世界' : (page.name ? `编辑世界 · ${page.name}` : '编辑世界')}
      aside={(
        <WorldCardPreview
          name={page.name}
          description={page.description}
          coverUrl={appearance.coverAvatarUrl}
          accentColor={appearance.accentColor}
        />
      )}
    >
      <WorldEditSections
        isCreate={isCreate}
        worldId={worldId}
        navigate={navigate}
        diaryChatDateMode={page.diaryChatDateMode}
        appearance={appearance}
        page={page}
      />
    </EditPageShell>
  );
}
