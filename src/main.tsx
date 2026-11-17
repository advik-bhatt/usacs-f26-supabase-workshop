import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Console } from "./pages/Console";
import { MissionControl } from "./pages/MissionControl";
import "./styles.css";

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function App() {
  const hash = useHash();
  // #/control is the big screen for the projector; everything else is the phone console
  return hash.startsWith("#/control") ? <MissionControl /> : <Console />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
