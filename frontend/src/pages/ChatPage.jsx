import { useNavigate } from 'react-router-dom';

// T11 将实现完整对话界面
export default function ChatPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-[var(--text)]">
      <p className="text-lg mb-4">对话界面（即将推出）</p>
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-[var(--accent)] hover:underline"
      >
        返回
      </button>
    </div>
  );
}
