import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./AuthContext.jsx";
import RootApp from "./RootApp.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RootApp />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
