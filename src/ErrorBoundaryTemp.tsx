import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message?: string };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("Slinger crashed:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "linear-gradient(180deg,#131e34,#0b1222 45%,#0a0d16)",
          color: "#fff",
          zIndex: 9999,
        }}
      >
        <div
          style={{
            width: "min(92vw, 520px)",
            background: "rgba(20,28,48,.9)",
            border: "1px solid #2a3a5e",
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 18px 60px rgba(0,0,0,.6)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Slinger hit a snag</h2>
          <p style={{ opacity: 0.9 }}>
            Something threw before render. Open the console for details.
          </p>
          {this.state.message && (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "#0b1324",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #24355a",
                marginTop: 12,
                fontSize: 12,
              }}
            >
              {this.state.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
