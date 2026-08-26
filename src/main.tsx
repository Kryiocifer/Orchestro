import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { Toaster } from "react-hot-toast";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-center"
      containerStyle={{ bottom: 104 }}
      toastOptions={{
        style: {
          background: "#282828",
          color: "#fff",
          borderRadius: "8px",
          fontSize: "13px",
          padding: "10px 14px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          border: "1px solid rgba(255,255,255,0.08)",
          maxWidth: "340px",
        },
        success: {
          iconTheme: {
            primary: "#1db954",
            secondary: "#fff",
          },
        },
        duration: 2500,
      }}
    />
  </React.StrictMode>
);
