import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { Page, type HarnessProps } from "./page";

const root = document.getElementById("root");
const props = JSON.parse(document.getElementById("harness-props")?.textContent ?? "null") as HarnessProps | null;
// StrictMode only acts in a development build (build.mjs --dev), where it double-mounts every effect.
if (root && props) {
  hydrateRoot(
    root,
    <StrictMode>
      <Page {...props} />
    </StrictMode>,
  );
}
