import { hydrateRoot } from "react-dom/client";
import { Page, type HarnessProps } from "./page";

const root = document.getElementById("root");
const props = JSON.parse(document.getElementById("harness-props")?.textContent ?? "null") as HarnessProps | null;
if (root && props) hydrateRoot(root, <Page {...props} />);
