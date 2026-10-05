import { useLocation, useNavigate } from 'react-router-dom';

// 打开设置弹层：背景沿用当前页（已在弹层里时沿用弹层下面那页），关闭后回到打开前的位置
export function useOpenSettings() {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    const realBackground = location.state?.backgroundLocation ?? location;
    navigate('/settings', {
      state: {
        backgroundLocation: realBackground,
        from: {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
          state: location.state,
        },
      },
    });
  };
}
