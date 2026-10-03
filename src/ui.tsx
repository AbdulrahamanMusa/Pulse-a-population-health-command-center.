import "@/styles.css";

import App from "@/App";

const { ReactDOM } = (window as unknown as { shinyreact: { ReactDOM: typeof import("react-dom/client") } }).shinyreact;

document.title = "Pulse · Health Command Center";

// The page has no mount container; the client appends its own.
const root = ReactDOM.createRoot(document.body.appendChild(document.createElement("div")));
root.render(<App />);
