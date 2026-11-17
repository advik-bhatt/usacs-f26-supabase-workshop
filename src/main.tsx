import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TraderApp } from "./pages/Trader";
import { Floor } from "./pages/Floor";
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
  // #/floor is the big screen for the projector; everything else is your phone
  return hash.startsWith("#/floor") ? <Floor /> : <TraderApp />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
