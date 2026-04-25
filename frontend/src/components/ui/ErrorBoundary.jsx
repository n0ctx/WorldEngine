import { Component } from 'react';

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
    console.error('[ErrorBoundary] 捕获到渲染错误:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
          <h1 className="text-xl font-bold text-[var(--we-color-text-danger)] mb-4">
            页面出现错误
          </h1>
          <p className="text-sm text-[var(--we-color-text-secondary)] mb-6 max-w-md">
            应用渲染过程中发生异常。点击下方按钮重新加载页面，或联系开发者反馈问题。
          </p>
          {this.state.error && (
            <pre className="text-xs text-left bg-[var(--we-color-surface)] p-4 rounded-lg mb-6 max-w-lg overflow-auto opacity-70">
              {this.state.error.toString()}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            className="px-4 py-2 rounded-lg bg-[var(--we-color-accent)] text-[var(--we-color-text-inverse)] text-sm hover:opacity-90 transition-opacity"
          >
            重新加载页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
