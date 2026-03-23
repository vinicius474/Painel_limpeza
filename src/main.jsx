import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./AuthContext.jsx";
import RootApp from "./RootApp.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <RootApp />
    </AuthProvider>
  </React.StrictMode>
);
