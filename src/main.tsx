import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.scss";
import ErrorBoundary from "./ErrorBoundaryTemp";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("No #root element found in index.html");

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
