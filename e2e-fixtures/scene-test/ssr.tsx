import { renderToString } from "react-dom/server";
import { prefetchScript, sceneNoScriptCss, SCENE_DATA_ID, serializePageSceneData, splashBootScript, splashCss } from "../../src/scenes";
import { Page, pageSceneData, type HarnessProps } from "./page";

/** The whole document, laid out the way the README tells a real page to render its <head>. */
export function renderDocument(props: HarnessProps): string {
  const propsJson = JSON.stringify(props).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>scene test</title>
<style>html,body{margin:0}body{background:#111;font-family:system-ui}${splashCss()}</style>
<noscript><style>${sceneNoScriptCss()}</style></noscript>
<script type="application/json" id="${SCENE_DATA_ID}">${serializePageSceneData(pageSceneData(props.manifest))}</script>
<script>${splashBootScript()}</script>
<script>${prefetchScript()}</script>
</head>
<body>
<div id="root">${renderToString(<Page {...props} />)}</div>
<script type="application/json" id="harness-props">${propsJson}</script>
<script type="module" src="/client.js"></script>
</body>
</html>`;
}
