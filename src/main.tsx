import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Kitchen } from "./pages/Kitchen";
import { Pass } from "./pages/Pass";
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
  // #/pass is the big screen for the projector; everything else is the kitchen
  return hash.startsWith("#/pass") ? <Pass /> : <Kitchen />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
