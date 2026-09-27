import { useLocation, useNavigate, useParams } from 'react-router-dom';
import EditPageShell from './layout/EditPageShell';
import useWorldAppearance from './WorldEditPage/useWorldAppearance.js';
import useWorldEditPage from './WorldEditPage/useWorldEditPage.js';
import WorldEditSections from './WorldEditPage/WorldEditSections.jsx';

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
      isOverlay={isOverlay}
      onClose={page.handleClose}
      title={isCreate ? '新建世界' : (page.name ? `编辑世界 · ${page.name}` : '')}
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
