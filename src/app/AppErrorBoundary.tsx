import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean; reference: string };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, reference: "" };

  static getDerivedStateFromError(): State {
    return { failed: true, reference: crypto.randomUUID().slice(0, 8).toUpperCase() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SARAFI_RENDER_FAILURE", {
      name: error.name,
      message: error.message,
      componentStack: info.componentStack,
      reference: this.state.reference,
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-error-shell" role="alert">
        <section className="app-error-card">
          <p className="kicker">SARAFI · {this.state.reference}</p>
          <h1>این صفحه به مشکل روبه‌رو شد</h1>
          <p>ستاسو معلومات نه دي حذف شوي. پاڼه بیا پرانیزئ. Your data was not deleted; reload this page to continue.</p>
          <button className="primary-action" type="button" onClick={() => window.location.reload()}>
            بازکردن دوباره · بیا پرانیستل · Reload
          </button>
        </section>
      </main>
    );
  }
}
