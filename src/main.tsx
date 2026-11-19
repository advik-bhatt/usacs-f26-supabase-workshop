import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Play } from "./pages/Play";
import { Live } from "./pages/Live";
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
  // #/live is the big screen for the projector; everything else is the game
  return hash.startsWith("#/live") ? <Live /> : <Play />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
