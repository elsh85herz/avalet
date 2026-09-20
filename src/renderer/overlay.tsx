import { createRoot } from "react-dom/client";
import { OverlayApp } from "./components/OverlayApp.js";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");
createRoot(container).render(<OverlayApp />);
