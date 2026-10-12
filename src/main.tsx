import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import { StoreProvider } from "./store";
import "./styles.css";

if (location.hostname.startsWith("play.") && (location.pathname === "/" || location.pathname === "")) {
  history.replaceState(null, "", `/play${location.search}`);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <StoreProvider>
          <App />
        </StoreProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
