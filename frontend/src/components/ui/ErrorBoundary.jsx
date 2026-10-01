import { Component } from 'react';
import { log } from '../../core/utils/logger.js';
import Button from './Button.jsx';

/**
 * React Error Boundary —— 捕获子组件渲染错误，防止整个应用白屏
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    log.error('ui.error_boundary', error, { silent: true });
    log.error('ui.error_boundary.info', errorInfo, { silent: true });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
          <h1 className="we-type-subheading text-[var(--we-color-status-danger)] mb-4">
            页面出现错误
          </h1>
          <p className="we-type-ui text-[var(--we-color-text-secondary)] mb-6 max-w-md">
            应用渲染过程中发生异常。重新加载后会优先尝试恢复本地暂存的未发送输入，再不行再联系开发者反馈问题。
          </p>
          {this.state.error && (
            <pre className="we-type-caption text-left bg-[var(--we-color-bg-surface)] p-4 rounded-[var(--we-radius-lg)] mb-6 max-w-lg overflow-auto text-[var(--we-color-text-tertiary)]">
              {this.state.error.toString()}
            </pre>
          )}
          <Button variant="primary" onClick={this.handleReload}>
            刷新并尝试恢复草稿
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
