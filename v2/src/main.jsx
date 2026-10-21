import React from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./state/Auth.jsx";
import App from "./App.jsx";
import "./styles.css";
createRoot(document.getElementById("root")).render(<AuthProvider><App /></AuthProvider>);
