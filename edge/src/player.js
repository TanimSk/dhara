// The embed player page: hls.js + a small custom UI. No dependency on the dashboard server.

const HLS_JS = "https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js";

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#000;color:#f5f5f7;overflow:hidden;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent}
`;

export function renderMessage(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${BASE_CSS}
.msg{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;text-align:center;
  background:radial-gradient(120% 120% at 50% 0%,#1c1c1e 0%,#000 70%)}
.msg h1{font-size:17px;font-weight:600;letter-spacing:-.01em}
.msg p{font-size:14px;color:#a1a1a6;max-width:360px;line-height:1.5}
.mark{width:28px;height:28px;margin-bottom:10px;opacity:.9}
</style></head><body><div class="msg">
<svg class="mark" viewBox="0 0 32 32" fill="none"><path d="M3 18c4-6 8-6 12 0s8 6 14 0" stroke="#f5f5f7" stroke-width="2.4" stroke-linecap="round"/><path d="M3 11c4-6 8-6 12 0s8 6 14 0" stroke="#f5f5f7" stroke-opacity=".45" stroke-width="2.4" stroke-linecap="round"/></svg>
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></div></body></html>`;
}

// Play triangle centered on its centroid (optical center), not its bounding box.
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .78.84 1.26 1.5.86l10.8-6.86a1 1 0 0 0 0-1.72L9.5 4.28C8.84 3.88 8 4.36 8 5.14z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2"/></svg>';

export function renderPlayer({ title, hls, poster, resumeKey, autoplay, start }) {
  const config = JSON.stringify({ hls, resumeKey, autoplay, start, title }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}
/* ---------- glass: layered like iOS materials ---------- */
.glass{position:relative;isolation:isolate;
  background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.05)),rgba(24,24,28,.30);
  -webkit-backdrop-filter:blur(22px) saturate(190%) brightness(1.06);backdrop-filter:blur(22px) saturate(190%) brightness(1.06);
  box-shadow:inset 0 1px .5px rgba(255,255,255,.42),inset 0 -.5px .5px rgba(255,255,255,.14),inset 0 0 0 .5px rgba(255,255,255,.14),
    0 8px 28px rgba(0,0,0,.30),0 1px 3px rgba(0,0,0,.22)}
.glass::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  background:radial-gradient(120% 90% at 18% -10%,rgba(255,255,255,.22),transparent 55%),
             radial-gradient(90% 60% at 100% 120%,rgba(255,255,255,.08),transparent 60%)}
.glass.dense{background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.04)),rgba(22,22,26,.62)}

.player{position:relative;width:100%;height:100%;background:#000;user-select:none;-webkit-user-select:none;outline:none;overflow:hidden}
video{width:100%;height:100%;display:block;object-fit:contain;background:#000}
.gest{position:absolute;inset:0;z-index:1}
.shade{position:absolute;inset:auto 0 0 0;height:96px;pointer-events:none;z-index:2;
  background:linear-gradient(to top,rgba(0,0,0,.45),rgba(0,0,0,0));opacity:0;transition:opacity .3s}
.top{position:absolute;inset:0 0 auto 0;z-index:2;padding:12px 16px 26px;font-size:13px;font-weight:500;letter-spacing:-.005em;
  background:linear-gradient(to bottom,rgba(0,0,0,.5),rgba(0,0,0,0));opacity:0;transition:opacity .3s;pointer-events:none;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,.4)}

/* ---------- center play ---------- */
.big{position:absolute;left:50%;top:50%;z-index:3;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:0;cursor:pointer;
  display:flex;align-items:center;justify-content:center;color:#fff;transition:transform .25s cubic-bezier(.2,.8,.2,1.2),opacity .2s}
.big svg{width:26px;height:26px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25))}
.big:hover{transform:scale(1.07)}
.big:active{transform:scale(.96)}
.playing .big{opacity:0;pointer-events:none;transform:scale(.85)}
.flash{position:absolute;left:50%;top:50%;z-index:3;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;color:#fff;opacity:0;pointer-events:none}
.flash svg{width:22px;height:22px}
.flash.go{animation:flash .55s ease-out}
@keyframes flash{0%{opacity:.95;transform:scale(.9)}100%{opacity:0;transform:scale(1.25)}}
.spinner{position:absolute;left:50%;top:50%;z-index:3;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
  border:2.5px solid rgba(255,255,255,.22);border-top-color:#fff;animation:spin .8s linear infinite;display:none}
.waiting .spinner{display:block}
.waiting .big{opacity:0}
@keyframes spin{to{transform:rotate(360deg)}}

/* ---------- double-tap ripple ---------- */
.ripple{position:absolute;top:0;bottom:0;width:38%;z-index:2;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;
  pointer-events:none;opacity:0;transition:opacity .25s;font-size:12px;font-weight:600;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.4)}
.ripple.l{left:0;border-radius:0 50% 50% 0/0 50% 50% 0;background:radial-gradient(closest-side at 30% 50%,rgba(255,255,255,.16),rgba(255,255,255,.05) 70%,transparent)}
.ripple.r{right:0;border-radius:50% 0 0 50%/50% 0 0 50%;background:radial-gradient(closest-side at 70% 50%,rgba(255,255,255,.16),rgba(255,255,255,.05) 70%,transparent)}
.ripple.on{opacity:1}
.ripple .chev{display:flex;gap:1px}
.ripple .chev svg{width:14px;height:14px;opacity:.35;animation:chev .8s infinite}
.ripple .chev svg:nth-child(2){animation-delay:.15s}.ripple .chev svg:nth-child(3){animation-delay:.3s}
.ripple.l .chev{flex-direction:row-reverse}
.ripple.l .chev svg{transform:scaleX(-1)}
@keyframes chev{0%,100%{opacity:.3}40%{opacity:1}}

/* ---------- compact control capsule ---------- */
.bar{position:absolute;left:10px;right:10px;bottom:10px;z-index:4;height:44px;border-radius:22px;padding:0 6px;
  display:flex;align-items:center;gap:2px;opacity:0;transform:translateY(6px);transition:opacity .3s,transform .3s}
.show .bar,.paused .bar,.show .shade,.paused .shade,.show .top,.paused .top{opacity:1;transform:none}
.idle.playing{cursor:none}
.btn{flex:none;width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:#fff;cursor:pointer;
  display:flex;align-items:center;justify-content:center;transition:background .15s,transform .15s}
.btn:hover{background:rgba(255,255,255,.14)}
.btn:active{transform:scale(.92)}
.btn svg{width:19px;height:19px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.2))}
.btn:focus-visible,.pill:focus-visible,.big:focus-visible{outline:2px solid rgba(255,255,255,.9);outline-offset:1px}
.time{flex:none;font-size:12px;font-weight:500;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.92);padding:0 6px;
  text-shadow:0 1px 1px rgba(0,0,0,.25)}
.time.dim{color:rgba(255,255,255,.6)}
.scrub{position:relative;flex:1;min-width:40px;height:28px;display:flex;align-items:center;cursor:pointer;touch-action:none;margin:0 4px}
.track{position:relative;width:100%;height:4px;border-radius:4px;background:rgba(255,255,255,.22);overflow:hidden;transition:height .15s}
.scrub:hover .track,.scrub.drag .track{height:6px}
.buf,.prog{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:4px}
.buf{background:rgba(255,255,255,.32)}.prog{background:#fff}
.knob{position:absolute;top:50%;width:13px;height:13px;margin:-6.5px 0 0 -6.5px;border-radius:50%;background:#fff;
  box-shadow:0 1px 4px rgba(0,0,0,.35);transform:scale(0);transition:transform .15s}
.scrub:hover .knob,.scrub.drag .knob{transform:scale(1)}
.tip{position:absolute;bottom:32px;padding:4px 8px;border-radius:9px;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;
  transform:translateX(-50%);display:none;pointer-events:none;white-space:nowrap}
.scrub:hover .tip,.scrub.drag .tip{display:block}
.pill{flex:none;height:26px;min-width:34px;padding:0 9px;border:0;border-radius:13px;background:rgba(255,255,255,.12);color:#fff;font:inherit;
  font-size:11.5px;font-weight:650;cursor:pointer;font-variant-numeric:tabular-nums;margin:0 3px;transition:background .15s}
.pill:hover{background:rgba(255,255,255,.22)}
.vol{display:flex;align-items:center}
.vol input{width:0;opacity:0;transition:width .2s,opacity .2s;accent-color:#fff;height:4px}
.vol:hover input,.vol:focus-within input{width:64px;opacity:1;margin-right:4px}

/* ---------- menus & panels: always above the capsule ---------- */
.menu{position:absolute;right:12px;bottom:62px;z-index:10;min-width:168px;max-height:calc(100% - 76px);overflow-y:auto;padding:5px;
  border-radius:16px;display:none;transform-origin:bottom right}
.menu.open{display:block;animation:pop .18s cubic-bezier(.2,.8,.2,1)}
@keyframes pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
.menu h4{font-size:10.5px;font-weight:650;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.07em;padding:7px 10px 4px}
.item{display:flex;width:100%;align-items:center;gap:10px;padding:7px 10px;border:0;border-radius:10px;background:transparent;
  color:#fff;font:inherit;font-size:13px;cursor:pointer;text-align:left;white-space:nowrap}
.item:hover,.item:focus-visible{background:rgba(255,255,255,.14);outline:none}
.item .ic{width:16px;height:16px;flex:none;opacity:.9}
.item .ic svg{width:16px;height:16px}
.item .end{margin-left:auto;padding-left:14px;color:rgba(255,255,255,.5);font-size:12px}
.item[aria-checked=true] .end::after{content:"";display:inline-block;width:6px;height:6px;margin-left:8px;vertical-align:1px;border-radius:50%;background:#fff}
.sep{height:.5px;background:rgba(255,255,255,.14);margin:4px 6px}
.foot{padding:6px 10px 4px;font-size:11px;color:rgba(255,255,255,.4)}
.ctx{right:auto;bottom:auto;min-width:228px;transform-origin:top left}

.panel{position:absolute;z-index:11;border-radius:16px;padding:12px 14px;display:none;font-size:12px}
.panel.open{display:block;animation:pop .18s cubic-bezier(.2,.8,.2,1)}
.panel .x{position:absolute;top:6px;right:6px;width:24px;height:24px}
.panel .x svg{width:12px;height:12px}
.stats{left:12px;top:12px;min-width:250px;padding-right:38px;font-family:"SF Mono",ui-monospace,Menlo,monospace;font-size:11px;line-height:1.75}
.stats b{display:inline-block;width:108px;color:rgba(255,255,255,.55);font-weight:500}
.keys{left:50%;top:50%;transform:translate(-50%,-50%);width:min(340px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto}
.keys.open{animation:none}
.keys h3{font-size:13px;font-weight:600;margin-bottom:8px}
.keys div{display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:12.5px;color:rgba(255,255,255,.85)}
.keys kbd{font:inherit;font-size:11px;font-weight:600;padding:2px 7px;border-radius:6px;background:rgba(255,255,255,.14);color:#fff;white-space:nowrap}

.toast{position:absolute;left:50%;top:14px;z-index:12;transform:translateX(-50%);padding:7px 13px;border-radius:14px;font-size:12.5px;font-weight:600;
  opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap}
.toast.on{opacity:1}
.err{position:absolute;inset:0;z-index:20;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;font-size:14px;color:#d2d2d7;background:#000}
.error .err{display:flex}

@media (max-width:520px){.dur,.pip,.vol{display:none}.bar{left:6px;right:6px;bottom:6px;height:40px}.btn{width:32px;height:32px}
  .menu{bottom:54px}.big{width:56px;height:56px;margin:-28px 0 0 -28px}.big svg{width:22px;height:22px}}
@media (hover:none){.vol{display:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<div class="player paused" id="p" tabindex="0" aria-label="Video player">
  <video id="v" playsinline preload="metadata" ${poster ? `poster="${escapeHtml(poster)}"` : ""}></video>
  <div class="gest" id="gest"></div>
  <div class="shade"></div>
  <div class="top">${escapeHtml(title)}</div>
  <div class="ripple l" id="rl"><span class="chev">${chev()}${chev()}${chev()}</span><span id="rlt">10 seconds</span></div>
  <div class="ripple r" id="rr"><span class="chev">${chev()}${chev()}${chev()}</span><span id="rrt">10 seconds</span></div>
  <div class="spinner"></div>
  <button class="big glass" id="big" aria-label="Play">${PLAY}</button>
  <div class="flash glass" id="flash"></div>
  <div class="toast glass dense" id="toast"></div>

  <div class="bar glass" id="bar">
    <button class="btn" id="play" aria-label="Play">${PLAY}</button>
    <span class="time" id="cur">0:00</span>
    <div class="scrub" id="scrub" role="slider" aria-label="Seek" tabindex="-1">
      <div class="track"><div class="buf" id="buf"></div><div class="prog" id="prog"></div></div>
      <div class="knob" id="knob"></div><div class="tip glass dense" id="tip"></div>
    </div>
    <span class="time dim dur" id="dur">0:00</span>
    <div class="vol"><button class="btn" id="mute" aria-label="Mute"></button><input id="vol" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"></div>
    <button class="pill" id="speed" aria-label="Playback speed" aria-haspopup="menu">1×</button>
    <button class="btn" id="settings" aria-label="Quality" aria-haspopup="menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg></button>
    <button class="btn pip" id="pip" aria-label="Picture in picture"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><rect x="12" y="11.5" width="6.5" height="5" rx="1.2" fill="currentColor" stroke="none"/></svg></button>
    <button class="btn" id="fs" aria-label="Full screen"></button>
  </div>

  <div class="menu glass dense" id="menu" role="menu"></div>
  <div class="menu ctx glass dense" id="ctx" role="menu"></div>
  <div class="panel stats glass dense" id="stats"><button class="btn x" data-close="stats" aria-label="Close stats">${xIcon()}</button><div id="statsBody"></div></div>
  <div class="panel keys glass dense" id="keys"><button class="btn x" data-close="keys" aria-label="Close shortcuts">${xIcon()}</button>
    <h3>Keyboard shortcuts</h3>
    <div><span>Play / pause</span><kbd>Space</kbd></div>
    <div><span>Back / forward 10 s</span><kbd>J · L</kbd></div>
    <div><span>Back / forward 5 s</span><kbd>← · →</kbd></div>
    <div><span>Volume</span><kbd>↑ · ↓</kbd></div>
    <div><span>Mute</span><kbd>M</kbd></div>
    <div><span>Full screen</span><kbd>F</kbd></div>
    <div><span>Slower / faster</span><kbd>&lt; · &gt;</kbd></div>
    <div><span>Jump to 0% to 90%</span><kbd>0 to 9</kbd></div>
    <div><span>Back / forward 10 s</span><kbd>Double tap sides</kbd></div>
  </div>
  <div class="err" id="err">This video couldn't be played. Check your connection and try again.</div>
</div>
<script src="${HLS_JS}"></script>
<script>
(function(){
  var C = ${config};
  var $ = function(id){ return document.getElementById(id); };
  var p = $("p"), v = $("v"), menu = $("menu"), ctx = $("ctx");
  var I = {
    play: ${JSON.stringify(PLAY)},
    pause: ${JSON.stringify(PAUSE)},
    vol:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    mute:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    fs:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/></svg>',
    exit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20"/></svg>',
    loop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>',
    link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    code:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>',
    pipi:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><rect x="12" y="11.5" width="6.5" height="5" rx="1.2" fill="currentColor" stroke="none"/></svg>',
    keys:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8"/></svg>',
    info:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg>'
  };
  var speeds = [0.75, 1, 1.25, 1.5, 1.75, 2];
  var hls = null;
  var hover = window.matchMedia("(hover: hover)").matches;

  function store(k, val){ try { if (val === undefined) return localStorage.getItem(k); localStorage.setItem(k, val); } catch(e) { return null; } }
  function fmt(t){ if (!isFinite(t) || t < 0) t = 0; t = Math.floor(t); var h = Math.floor(t/3600), m = Math.floor(t%3600/60), s = t%60;
    return (h ? h + ":" + String(m).padStart(2,"0") : m) + ":" + String(s).padStart(2,"0"); }
  function toast(msg){ var el = $("toast"); el.textContent = msg; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(function(){ el.classList.remove("on"); }, 900); }

  // ---- source ----
  if (window.Hls && Hls.isSupported()) {
    hls = new Hls({ capLevelToPlayerSize: true, startLevel: -1, maxBufferLength: 30 });
    hls.loadSource(C.hls);
    hls.attachMedia(v);
    hls.on(Hls.Events.ERROR, function(_, d){
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !(d.response && d.response.code === 403)) hls.startLoad();
      else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else p.classList.add("error");
    });
  } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
    v.src = C.hls; // Safari / iOS native HLS
    $("settings").style.display = "none";
  } else {
    p.classList.add("error");
  }

  // ---- resume position & start time ----
  v.addEventListener("loadedmetadata", function(){
    var saved = parseFloat(store(C.resumeKey) || "0");
    var t = C.start || (saved > 5 && saved < v.duration - 10 ? saved : 0);
    if (t) v.currentTime = t;
    $("dur").textContent = fmt(Math.round(v.duration));
    if (C.autoplay) v.play().catch(function(){});
  }, { once: true });
  setInterval(function(){ if (!v.paused && v.currentTime > 0) store(C.resumeKey, String(Math.floor(v.currentTime))); }, 5000);
  v.addEventListener("ended", function(){ if (!v.loop) store(C.resumeKey, "0"); });

  // ---- play state ----
  function toggle(){ if (v.paused) v.play().catch(function(){}); else v.pause(); }
  function sync(){
    p.classList.toggle("paused", v.paused); p.classList.toggle("playing", !v.paused);
    $("play").innerHTML = v.paused ? I.play : I.pause;
    $("play").setAttribute("aria-label", v.paused ? "Play" : "Pause");
  }
  v.addEventListener("play", sync); v.addEventListener("pause", sync); sync();
  v.addEventListener("waiting", function(){ p.classList.add("waiting"); });
  ["playing","canplay","seeked"].forEach(function(e){ v.addEventListener(e, function(){ p.classList.remove("waiting"); }); });
  function flash(){ var f = $("flash"); f.innerHTML = v.paused ? I.pause : I.play; f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
  $("big").onclick = function(e){ e.stopPropagation(); toggle(); };
  $("play").onclick = toggle;
  p.querySelectorAll("button").forEach(function(b){ b.addEventListener("pointerup", function(e){ if (e.pointerType === "mouse") setTimeout(function(){ p.focus({ preventScroll: true }); }, 0); }); });

  function seekBy(s){ v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s)); }

  // ---- taps: single = play/pause (mouse) or show controls (touch); double on the sides = seek 10 s ----
  var lastTap = 0, lastZone = "", tapTimer = null, seekModeUntil = 0, acc = { l: 0, r: 0 }, accTimer = {};
  function zoneOf(e){ var r = p.getBoundingClientRect(), x = (e.clientX - r.left) / r.width; return x < 0.35 ? "l" : x > 0.65 ? "r" : "c"; }
  function ripple(z){
    var el = $(z === "l" ? "rl" : "rr"); acc[z] += 10;
    $(z === "l" ? "rlt" : "rrt").textContent = acc[z] + " seconds";
    el.classList.add("on"); clearTimeout(accTimer[z]);
    accTimer[z] = setTimeout(function(){ el.classList.remove("on"); acc[z] = 0; }, 650);
  }
  function seekTap(z){ seekBy(z === "l" ? -10 : 10); ripple(z); seekModeUntil = Date.now() + 650; }
  function single(type){
    if (type === "touch") { if (p.classList.contains("show") && !v.paused) hideNow(); else poke(); }
    else { flash(); toggle(); }
  }
  $("gest").addEventListener("pointerup", function(e){
    if (e.button !== 0) return;
    if (swallowTap) { swallowTap = false; return; }
    var z = zoneOf(e), now = Date.now();
    if (z !== "c" && now < seekModeUntil) { seekTap(z); return; }
    if (now - lastTap < 300 && z === lastZone) {
      clearTimeout(tapTimer); lastTap = 0;
      if (z === "c") fullscreen(); else seekTap(z);
      return;
    }
    lastTap = now; lastZone = z;
    var type = e.pointerType;
    tapTimer = setTimeout(function(){ single(type); }, 260);
  });

  // ---- progress ----
  var scrub = $("scrub"), dragging = false;
  function render(){
    var d = v.duration || 0, pct = d ? v.currentTime / d * 100 : 0;
    $("prog").style.width = pct + "%"; $("knob").style.left = pct + "%";
    $("cur").textContent = fmt(Math.min(v.currentTime, Math.round(d) || v.currentTime));
    if (v.buffered.length && d) $("buf").style.width = (v.buffered.end(v.buffered.length - 1) / d * 100) + "%";
  }
  v.addEventListener("timeupdate", render); v.addEventListener("progress", render);
  function frac(e){ var r = scrub.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); }
  function tipAt(f){ var tip = $("tip"); tip.textContent = fmt(f * (v.duration || 0)); tip.style.left = (f * 100) + "%"; }
  scrub.addEventListener("pointerdown", function(e){ dragging = true; scrub.classList.add("drag"); scrub.setPointerCapture(e.pointerId); var f = frac(e); v.currentTime = f * (v.duration || 0); tipAt(f); render(); });
  scrub.addEventListener("pointermove", function(e){ var f = frac(e); tipAt(f); if (dragging) { v.currentTime = f * (v.duration || 0); render(); } });
  function endDrag(){ dragging = false; scrub.classList.remove("drag"); }
  scrub.addEventListener("pointerup", endDrag); scrub.addEventListener("pointercancel", endDrag);

  // ---- volume ----
  function syncVol(){ $("mute").innerHTML = (v.muted || v.volume === 0) ? I.mute : I.vol; $("vol").value = v.muted ? 0 : v.volume; }
  $("mute").onclick = function(){ v.muted = !v.muted; syncVol(); };
  $("vol").oninput = function(e){ v.volume = +e.target.value; v.muted = v.volume === 0; syncVol(); };
  syncVol();

  // ---- speed ----
  var savedSpeed = parseFloat(store("dhara:speed") || "1");
  if (speeds.indexOf(savedSpeed) >= 0) v.playbackRate = savedSpeed;
  function setSpeed(s){ v.playbackRate = s; store("dhara:speed", String(s)); $("speed").textContent = s + "×"; toast(s === 1 ? "Normal speed" : s + "× speed"); }
  $("speed").textContent = v.playbackRate + "×";
  $("speed").onclick = function(e){ e.stopPropagation(); openMenu("Speed", speeds.map(function(s){ return { label: s === 1 ? "Normal" : s + "×", on: v.playbackRate === s, pick: function(){ setSpeed(s); } }; })); };

  // ---- quality ----
  $("settings").onclick = function(e){
    e.stopPropagation();
    if (!hls) return;
    var cur = hls.levels[hls.currentLevel];
    var items = [{ label: "Auto", end: hls.autoLevelEnabled && cur ? cur.height + "p" : "", on: hls.autoLevelEnabled, pick: function(){ hls.currentLevel = -1; toast("Auto quality"); } }];
    hls.levels.map(function(l, i){ return { h: l.height, i: i }; }).sort(function(a, b){ return b.h - a.h; }).forEach(function(l){
      items.push({ label: l.h + "p", on: !hls.autoLevelEnabled && hls.currentLevel === l.i, pick: function(){ hls.currentLevel = l.i; toast(l.h + "p"); } });
    });
    openMenu("Quality", items);
  };

  function fill(el, title, items){
    el.innerHTML = title ? "<h4>" + title + "</h4>" : "";
    items.forEach(function(it){
      if (it.sep) { var s = document.createElement("div"); s.className = "sep"; el.appendChild(s); return; }
      if (it.foot) { var f = document.createElement("div"); f.className = "foot"; f.textContent = it.foot; el.appendChild(f); return; }
      var b = document.createElement("button"); b.className = "item";
      b.setAttribute("role", it.on === undefined ? "menuitem" : "menuitemradio");
      if (it.on !== undefined) b.setAttribute("aria-checked", it.on ? "true" : "false");
      b.innerHTML = (it.icon ? '<span class="ic">' + it.icon + "</span>" : "") + "<span></span>" + '<span class="end"></span>';
      b.children[it.icon ? 1 : 0].textContent = it.label;
      if (it.end) b.querySelector(".end").textContent = it.end;
      b.onclick = function(e){ e.stopPropagation(); it.pick(); closeAll(); };
      el.appendChild(b);
    });
  }
  function openMenu(title, items){
    if (menu.classList.contains("open") && menu.dataset.title === title) { closeAll(); return; }
    closeAll(); fill(menu, title, items); menu.dataset.title = title; menu.classList.add("open"); poke();
    var first = menu.querySelector(".item"); if (first && !hover) first.focus();
  }
  function closeAll(){
    var was = menu.classList.contains("open") || ctx.classList.contains("open");
    menu.classList.remove("open"); ctx.classList.remove("open"); return was;
  }
  // A press outside an open menu only closes it; it doesn't also play/pause.
  var swallowTap = false;
  document.addEventListener("pointerdown", function(e){ if (!e.target.closest(".menu")) swallowTap = closeAll(); }, true);

  // ---- right-click menu ----
  function copy(text, msg){
    function done(){ toast(msg); }
    function fallback(){ var t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); done(); } catch(e) { toast("Couldn't copy"); } t.remove(); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  function pageUrl(at){ var u = new URL(location.href); u.searchParams.delete("t"); u.searchParams.delete("autoplay"); if (at) u.searchParams.set("t", String(Math.floor(v.currentTime))); return u.toString(); }
  p.addEventListener("contextmenu", function(e){
    if (ctx.classList.contains("open")) { closeAll(); return; } // a second right-click shows the browser's own menu
    e.preventDefault(); closeAll();
    fill(ctx, "", [
      { icon: I.loop, label: "Loop", on: v.loop, pick: function(){ v.loop = !v.loop; toast(v.loop ? "Loop on" : "Loop off"); } },
      { sep: true },
      { icon: I.link, label: "Copy video URL", pick: function(){ copy(pageUrl(false), "Link copied"); } },
      { icon: I.clock, label: "Copy video URL at current time", pick: function(){ copy(pageUrl(true), "Link copied at " + fmt(v.currentTime)); } },
      { icon: I.code, label: "Copy embed code", pick: function(){ copy('<iframe src="' + pageUrl(false) + '" width="640" height="360" style="border:0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>', "Embed code copied"); } },
      { sep: true },
      { icon: I.pipi, label: "Picture in picture", pick: pip },
      { icon: I.keys, label: "Keyboard shortcuts", pick: function(){ openPanel("keys"); } },
      { icon: I.info, label: "Stats for nerds", pick: function(){ openPanel("stats"); } },
      { foot: "dhara player" }
    ]);
    ctx.style.visibility = "hidden"; ctx.classList.add("open");
    var r = p.getBoundingClientRect(), w = ctx.offsetWidth, h = ctx.offsetHeight;
    var x = Math.min(e.clientX - r.left, r.width - w - 8), y = Math.min(e.clientY - r.top, r.height - h - 8);
    ctx.style.left = Math.max(8, x) + "px"; ctx.style.top = Math.max(8, y) + "px"; ctx.style.visibility = "";
  });

  // ---- panels: stats for nerds, shortcuts ----
  var statsTimer = null;
  function openPanel(id){
    $(id).classList.add("open");
    if (id === "stats") { renderStats(); clearInterval(statsTimer); statsTimer = setInterval(renderStats, 500); }
  }
  function closePanel(id){ $(id).classList.remove("open"); if (id === "stats") clearInterval(statsTimer); }
  document.querySelectorAll("[data-close]").forEach(function(b){ b.onclick = function(e){ e.stopPropagation(); closePanel(b.dataset.close); }; });
  function renderStats(){
    var q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
    var lvl = hls && hls.levels[hls.currentLevel];
    var buf = v.buffered.length ? Math.max(0, v.buffered.end(v.buffered.length - 1) - v.currentTime) : 0;
    var rows = [
      ["Video", (C.resumeKey || "").replace("dhara:", "").slice(0, 18)],
      ["Viewport", Math.round(v.clientWidth) + "×" + Math.round(v.clientHeight) + " · " + (window.devicePixelRatio || 1) + "x"],
      ["Current", (v.videoWidth || 0) + "×" + (v.videoHeight || 0) + (lvl ? " · " + Math.round(lvl.bitrate / 1000) + " kbps" : "")],
      ["Quality", hls ? (hls.autoLevelEnabled ? "Auto · " : "Manual · ") + (lvl ? lvl.height + "p" : "-") : "Native HLS"],
      ["Bandwidth", hls && hls.bandwidthEstimate ? (hls.bandwidthEstimate / 1e6).toFixed(1) + " Mbps" : "-"],
      ["Buffer health", buf.toFixed(1) + " s"],
      ["Frames", q ? q.droppedVideoFrames + " dropped of " + q.totalVideoFrames : "-"],
      ["Codecs", lvl && (lvl.videoCodec || lvl.attrs && lvl.attrs.CODECS) || "-"],
      ["Speed", v.playbackRate + "×"]
    ];
    $("statsBody").innerHTML = rows.map(function(r){ return "<div><b></b><span></span></div>"; }).join("");
    $("statsBody").querySelectorAll("div").forEach(function(d, i){ d.firstChild.textContent = rows[i][0]; d.lastChild.textContent = rows[i][1]; });
  }

  // ---- PiP & fullscreen ----
  function pip(){ if (document.pictureInPictureElement) document.exitPictureInPicture(); else if (v.requestPictureInPicture) v.requestPictureInPicture().catch(function(){}); }
  if (!document.pictureInPictureEnabled) $("pip").style.display = "none";
  $("pip").onclick = pip;
  function fullscreen(){
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (p.requestFullscreen) p.requestFullscreen(); else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  }
  function syncFs(){ var on = !!(document.fullscreenElement || document.webkitFullscreenElement); $("fs").innerHTML = on ? I.exit : I.fs; $("fs").setAttribute("aria-label", on ? "Exit full screen" : "Full screen"); }
  $("fs").onclick = fullscreen; document.addEventListener("fullscreenchange", syncFs); document.addEventListener("webkitfullscreenchange", syncFs); syncFs();

  // ---- controls visibility ----
  var hideT;
  function busy(){ return dragging || menu.classList.contains("open") || ctx.classList.contains("open"); }
  function poke(){ p.classList.add("show"); p.classList.remove("idle"); clearTimeout(hideT); hideT = setTimeout(function(){ if (!v.paused && !busy()) hideNow(); else poke(); }, 2600); }
  function hideNow(){ clearTimeout(hideT); p.classList.remove("show"); p.classList.add("idle"); }
  p.addEventListener("pointermove", function(e){ if (e.pointerType === "mouse") poke(); });
  p.addEventListener("pointerleave", function(){ if (!v.paused && !busy()) hideNow(); });
  v.addEventListener("play", poke);

  // ---- keyboard ----
  p.addEventListener("keydown", function(e){
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key, handled = true;
    if (k === "Escape") { if (!closeAll()) { closePanel("keys"); closePanel("stats"); } }
    else if ((k === " " || k === "Enter") && e.target.closest && e.target.closest("button,input")) return;
    else if (k === " " || k === "k") { flash(); toggle(); }
    else if (k === "ArrowLeft") { seekBy(-5); toast("−5 s"); }
    else if (k === "ArrowRight") { seekBy(5); toast("+5 s"); }
    else if (k === "j") { seekBy(-10); ripple("l"); }
    else if (k === "l") { seekBy(10); ripple("r"); }
    else if (k === "f") fullscreen();
    else if (k === "m") { v.muted = !v.muted; syncVol(); toast(v.muted ? "Muted" : "Sound on"); }
    else if (k === "ArrowUp") { v.volume = Math.min(1, v.volume + .1); v.muted = false; syncVol(); toast("Volume " + Math.round(v.volume * 100) + "%"); }
    else if (k === "ArrowDown") { v.volume = Math.max(0, v.volume - .1); syncVol(); toast("Volume " + Math.round(v.volume * 100) + "%"); }
    else if (k === ">" || k === ".") { var i = speeds.indexOf(v.playbackRate); if (i < speeds.length - 1) setSpeed(speeds[i + 1]); }
    else if (k === "<" || k === ",") { var j = speeds.indexOf(v.playbackRate); if (j > 0) setSpeed(speeds[j - 1]); }
    else if (k === "?") openPanel("keys");
    else if (/^[0-9]$/.test(k) && v.duration) v.currentTime = v.duration * (+k / 10);
    else handled = false;
    if (handled) { e.preventDefault(); poke(); }
  });
  p.focus({ preventScroll: true });
})();
</script>
</body>
</html>`;
}

function chev() {
  return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .78.84 1.26 1.5.86l10.8-6.86a1 1 0 0 0 0-1.72L9.5 4.28C8.84 3.88 8 4.36 8 5.14z"/></svg>';
}

function xIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
}
