import { useState } from 'react';
import Button from '../ui/Button';
import FormGroup from '../ui/FormGroup';

export default function LlmConnectionTest({ provider, testConnection }) {
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const result = await testConnection();
      setTestResult(result.success ? { success: true } : { success: false, error: result.error });
    } catch (e) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setTestingConnection(false);
    }
  }

  if (!provider || !testConnection) return null;

  return (
    <FormGroup label="连接测试" variant="settings">
      <div className="we-settings-action-row we-settings-action-row--spaced">
        <Button
          variant="default"
          onClick={handleTestConnection}
          disabled={testingConnection}
        >
          {testingConnection ? '测试中…' : '测试连接'}
        </Button>
        {testResult?.success && <span className="we-settings-status-ok">连接成功</span>}
        {testResult && !testResult.success && (
          <span className="we-settings-status-error">{`连接失败：${testResult.error}`}</span>
        )}
      </div>
    </FormGroup>
  );
}
