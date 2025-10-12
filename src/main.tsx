import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import SplashScreen from "./components/SplashScreen";

const App = lazy(() => import("./App"));
const CompactApp = lazy(() => import("./CompactApp"));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<SplashScreen />}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/compact" element={<CompactApp />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>
);
