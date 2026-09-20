import { createRoot } from "react-dom/client";
import { MainApp } from "./components/MainApp.js";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");
createRoot(container).render(<MainApp />);
