import React from "react";
import ReactDOM from "react-dom/client";
import { AppRouter } from "./app/AppRouter";
import { I18nProvider } from "./ui/i18n";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <AppRouter />
    </I18nProvider>
  </React.StrictMode>
);
