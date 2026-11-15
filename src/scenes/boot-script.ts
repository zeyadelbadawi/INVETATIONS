// Inline <head> scripts and the splash lock CSS (playbook §6.7, §7.2).
//
// Security rule: every string here is a constant. Nothing is interpolated into them. Page data
// (scene URLs, which scenes gate) is read at run time from the JSON element `#sq-data`
// (see page-data.ts), which the caller renders separately with `serializePageSceneData`.
// boot-script.test.ts checks that the literals below match the exported constants.

export { PREFETCH_GLOBAL, SCENE_DATA_ID } from "./page-data";

/** `data-splash` on <html>: "hold" (locked, covered), "leaving" (locked, panel fading), "seen" (open). */
export const SPLASH_ATTR = "data-splash";
/** `data-splash-js` on <html>: set by the gate when it takes over from the boot script's failsafe. */
export const SPLASH_JS_ATTR = "data-splash-js";
/** Attribute on the splash panel element; the CSS below shows it only while the lock is on. */
export const SPLASH_PANEL_ATTR = "data-splash-panel";
/** The boot script lets go by itself after this long if the app script never takes over (§9). */
export const SPLASH_FAILSAFE_MS = 10000;

// The tier rules repeat device-tier.ts: reduced motion → no panel; Save-Data or 2G → no panel.
// A "3g" estimate does not count (§6.2).
const SPLASH_BOOT_SCRIPT = `(function(){try{
var d=document.documentElement,e=document.getElementById("sq-data"),s=e?JSON.parse(e.textContent||"null"):null,g=false,i;
s=s&&s.s;
if(!s||!s.length)return;
for(i=0;i<s.length;i++)if(s[i].g)g=true;
if(!g)return;
history.scrollRestoration="manual";
var c=navigator.connection,low=!!c&&(c.saveData===true||/(^|-)2g$/.test(c.effectiveType||""));
if(low||matchMedia("(prefers-reduced-motion: reduce)").matches)d.setAttribute("data-splash","seen");
else{
d.setAttribute("data-splash","hold");
setTimeout(function(){if(d.getAttribute("data-splash")==="hold"&&!d.hasAttribute("data-splash-js"))d.removeAttribute("data-splash")},10000);
}
}catch(_){}})();`;

const PREFETCH_SCRIPT = `(function(){try{
var w=window,e=document.getElementById("sq-data"),s=e?JSON.parse(e.textContent||"null"):null;
s=s&&s.s;
if(!s||!s.length||!w.fetch||!w.ReadableStream||!w.AbortController||!w.Promise)return;
var c=navigator.connection;
if(c&&(c.saveData===true||/(^|-)2g$/.test(c.effectiveType||"")))return;
if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
var m=w.innerWidth/w.innerHeight<0.9,r=w.__sq={v:m?"mobile":"desktop",x:false,d:{}},q=[],i,f,started=false;
function entry(u,n){
var t={u:u,n:n,l:0,s:0,c:new AbortController(),p:null,f:null,a:null,b:null};
t.p=new Promise(function(a,b){t.a=a;t.b=b});
t.p.catch(function(){});
return t;
}
for(i=0;i<s.length;i++){
f=m?s[i].m:s[i].d;
if(f&&typeof f[0]==="string"&&!r.d[f[0]])q.push(r.d[f[0]]=entry(f[0],f[1]));
}
function read(t,rd){
var parts=[];
function step(){
return rd.read().then(function(o){
if(o.done){
var all=new Uint8Array(t.l),at=0,j;
for(j=0;j<parts.length;j++){all.set(parts[j],at);at+=parts[j].length}
return all.buffer;
}
if(!t.s)t.s=performance.now();
parts.push(o.value);t.l+=o.value.length;
if(t.f)t.f();
return step();
});
}
return step();
}
function run(k){
if(k>=q.length)return;
var t=q[k];
if(r.x){t.b(new Error("stopped"));run(k+1);return}
fetch(t.u,{signal:t.c.signal,priority:"low"}).then(function(res){
if(!res.ok||!res.body)throw new Error("status "+res.status);
return read(t,res.body.getReader());
}).then(function(buf){t.a(buf);run(k+1)},function(err){t.b(err);run(k+1)});
}
function start(){if(started)return;started=true;run(0)}
if(w.requestAnimationFrame)w.requestAnimationFrame(function(){setTimeout(start,0)});
setTimeout(start,1000);
}catch(_){}})();`;

const SPLASH_CSS = `html[data-splash="hold"],html[data-splash="leaving"]{overflow:hidden}
html[data-splash="hold"]::after{content:"";position:fixed;inset:0;background:var(--splash-bg,#0c0c0c);z-index:2147483000}
[data-splash-panel]{display:none}
html[data-splash="hold"] [data-splash-panel],html[data-splash="leaving"] [data-splash-panel]{display:block;position:fixed;inset:0;z-index:2147483001;background:var(--splash-bg,#0c0c0c)}`;

/** No-JS: overlays driven by the scene variables show their final state (§9). Render inside <noscript><style>. */
const NOSCRIPT_CSS = `[data-seq-stage]{--seq-progress:1;--seq-hold:1}`;

/**
 * Script that locks the page behind the splash before the first paint. Render it inline in
 * <head>, after the `#sq-data` JSON element and before the body. It only acts when the page
 * lists at least one gating scene.
 */
export function splashBootScript(): string {
  return SPLASH_BOOT_SCRIPT;
}

/**
 * Script that starts the scene downloads right after the first paint, in page order, at low
 * priority. Render it inline in <head> after the `#sq-data` JSON element.
 */
export function prefetchScript(): string {
  return PREFETCH_SCRIPT;
}

/** CSS for the lock and the cover. Render it in a <style> in <head>. The panel colour is `--splash-bg`. */
export function splashCss(): string {
  return SPLASH_CSS;
}

export function sceneNoScriptCss(): string {
  return NOSCRIPT_CSS;
}
