import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Globe2, KeyRound, Lock, UserX } from "lucide-react";

import { useAuth } from "../lib/auth";
import { Button, Logo, cx } from "../components/ui";
import StreamCanvas from "../components/landing/StreamCanvas";
import { Reveal, useDarkTheme, useInView, useReducedMotion, useScrollProgress } from "../components/landing/motion";

const MEDIA = "/media";

const FAQ = [
  { q: "How do private videos work?", a: "Turn on private playback for a video or a whole library. Your website signs each viewer's link with your library key, a few lines of code we give you, and links expire when you choose. Students never need a dhara account." },
  { q: "Can students download or share the videos?", a: "Videos stream in small pieces rather than as one file, links expire, and the player only loads on domains you allow. That stops casual sharing and hotlinking. No platform can fully prevent screen recording; viewer watermarks are on our roadmap." },
  { q: "Which files can I upload?", a: "MP4, MOV, MKV and WebM up to 10 GB each. A two-hour class recorded on a phone or a laptop is fine." },
  { q: "How fast is playback?", a: "Video is served from Cloudflare's edge network, close to your students, and every class is prepared in four qualities. On a weak mobile signal the player switches to a lighter quality instead of stopping." },
  { q: "How do I pay?", a: "We send a monthly invoice in taka. Pay by bKash or bank transfer. No dollar card needed." },
];

/** A silent, looping background film. Shows the poster only for reduced motion. */
function Film({ name, className }: { name: string; className?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const [wrap, inView] = useInView<HTMLDivElement>("200px");
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (reduced) v.pause();
    else if (inView) v.play().catch(() => {});
  }, [reduced, inView]);
  return (
    <div ref={wrap} className={cx("absolute inset-0 overflow-hidden", className)}>
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        src={inView ? `${MEDIA}/${name}.mp4` : undefined}
        poster={`${MEDIA}/${name}.jpg`}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden
      />
    </div>
  );
}

// ---------- Nav ----------

function Nav() {
  const { me } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cx("fixed inset-x-0 top-0 z-40 transition-all duration-500", scrolled ? "bg-black/70 backdrop-blur-2xl border-b border-white/[0.07]" : "border-b border-transparent")}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" aria-label="dhara home"><Logo /></Link>
        <nav className="hidden md:flex items-center gap-8 text-[13px] text-white/70">
          <a href="#product" className="hover:text-white transition-colors">Product</a>
          <a href="#speed" className="hover:text-white transition-colors">Speed</a>
          <a href="#privacy" className="hover:text-white transition-colors">Privacy</a>
          <a href="#developers" className="hover:text-white transition-colors">Developers</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-1.5">
          {me ? (
            <Link to="/app"><Button size="sm">Open dashboard</Button></Link>
          ) : (
            <>
              <Link to="/login" className="hidden sm:block"><Button variant="ghost" size="sm" className="!text-white/75 hover:!text-white hover:!bg-white/10">Sign in</Button></Link>
              <Link to="/login"><Button size="sm">Start free trial</Button></Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ---------- Hero ----------

function Hero() {
  const film = useRef<HTMLDivElement>(null);
  const ref = useScrollProgress<HTMLElement>(
    (p, el) => {
      if (film.current) film.current.style.transform = `scale(${1 + p * 0.14})`;
      const content = el.querySelector<HTMLElement>("[data-hero-content]");
      if (content) {
        content.style.opacity = String(1 - p * 1.4);
        content.style.transform = `translateY(${-p * 80}px)`;
      }
    },
    { start: 0, end: -1 },
  );

  return (
    <section ref={ref} className="relative h-[100svh] min-h-[640px] overflow-hidden bg-black">
      <div ref={film} className="absolute inset-0 will-change-transform">
        <Film name="fiber-hero" />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_55%,rgba(0,0,0,0.15),rgba(0,0,0,0.75))]" />
      <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-black" />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />

      <div data-hero-content className="relative h-full flex flex-col items-center justify-end pb-[14vh] px-4 text-center">
        <p className="blur-in text-[13px] sm:text-[14px] font-medium text-white/60 tracking-wide" style={{ animationDelay: "150ms" }}>
          dhara <span lang="bn" className="font-[Noto_Serif_Bengali,serif]">ধারা</span> · Bangla for current
        </p>
        <h1 className="blur-in mt-5 text-[56px] leading-[0.95] sm:text-[104px] font-semibold tracking-[-0.055em] text-white" style={{ animationDelay: "300ms" }}>
          Your classes,
          <br />
          <span className="text-glow">flowing.</span>
        </h1>
        <p className="blur-in mt-6 max-w-xl text-[17px] sm:text-[21px] leading-snug text-white/70 tracking-[-0.01em]" style={{ animationDelay: "500ms" }}>
          Upload a lecture once. dhara streams it to every student, on any screen, at full speed.
        </p>
        <div className="blur-in mt-9 flex flex-col sm:flex-row items-center gap-3" style={{ animationDelay: "700ms" }}>
          <Link to="/login">
            <Button size="lg" className="!bg-white !text-black hover:!opacity-90 !px-7">Start free trial</Button>
          </Link>
          <a href="#product" className="group inline-flex items-center gap-1.5 h-12 px-5 text-[15px] font-medium text-white/80 hover:text-white">
            See it in action <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    </section>
  );
}

// ---------- Statement: words light up as you scroll ----------

const STATEMENT =
  "Record a class once. dhara turns it into a stream that reaches every student, on every phone, on every network, the moment it is ready.";

function Statement() {
  const words = STATEMENT.split(" ");
  const ref = useScrollProgress<HTMLElement>(
    (p, el) => {
      const spans = el.querySelectorAll<HTMLElement>("[data-word]");
      const lit = p * (spans.length + 4) - 2;
      spans.forEach((s, i) => (s.style.opacity = String(Math.max(0.16, Math.min(1, lit - i + 1)))));
    },
    { mode: "sticky" },
  );
  return (
    <section ref={ref} className="relative h-[220vh] bg-black">
      <div className="sticky top-0 h-[100svh] flex items-center justify-center px-6">
        <p className="max-w-4xl text-center text-[32px] leading-[1.15] sm:text-[56px] sm:leading-[1.08] font-semibold tracking-[-0.04em] text-white">
          {words.map((w, i) => (
            <span key={i} data-word className="transition-opacity duration-150" style={{ opacity: 0.16 }}>
              {w}{" "}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

// ---------- Product: the real dashboard on a laptop ----------

function Product() {
  const ref = useScrollProgress<HTMLDivElement>(
    (p, el) => {
      const e = 1 - Math.pow(1 - p, 3);
      el.style.transform = `perspective(2200px) rotateX(${(1 - e) * 22}deg) scale(${0.86 + e * 0.14})`;
      el.style.opacity = String(0.35 + e * 0.65);
    },
    { start: 1, end: 0.25 },
  );
  return (
    <section id="product" className="relative bg-black pt-10 pb-32 sm:pb-44 overflow-hidden scroll-mt-14">
      <div className="absolute left-1/2 top-[45%] -translate-x-1/2 h-[600px] w-[1100px] max-w-[140vw] rounded-full bg-[radial-gradient(closest-side,rgba(255,170,110,0.16),transparent)] blur-2xl" />
      <div className="relative px-4 sm:px-6">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="text-[40px] sm:text-[64px] leading-[1.02] font-semibold tracking-[-0.045em] text-white">One calm place for every class.</h2>
          <p className="mt-5 text-[17px] sm:text-[19px] text-white/60 leading-relaxed">
            Upload, organize and share your lectures. Watch them encode live, then embed them anywhere with one line.
          </p>
        </Reveal>

        <div className="mt-16 sm:mt-24 mx-auto max-w-[1080px]">
          <div ref={ref} className="origin-bottom will-change-transform">
            <div className="relative rounded-[18px] sm:rounded-[26px] bg-[#0c0c0e] p-[1.3%] pb-[1.8%] ring-1 ring-white/[0.12] shadow-[0_80px_160px_-60px_rgba(255,160,90,0.35)]">
              <span className="absolute top-[0.55%] left-1/2 -translate-x-1/2 size-[5px] rounded-full bg-white/15" />
              <img
                src={`${MEDIA}/dashboard.webp`}
                alt="The dhara dashboard showing a physics library with three lectures ready to stream"
                width={2848}
                height={1576}
                loading="lazy"
                decoding="async"
                className="block w-full rounded-[6px] sm:rounded-[9px]"
              />
            </div>
            <div className="relative mx-auto -mt-px h-[10px] sm:h-[16px] w-[112%] -ml-[6%] rounded-b-[22px] bg-gradient-to-b from-[#4a4a4f] via-[#2a2a2e] to-[#141416] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)]">
              <span className="absolute left-1/2 top-0 -translate-x-1/2 h-[4px] sm:h-[6px] w-[14%] rounded-b-[8px] bg-[#1a1a1d]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Upload once ----------

const LADDER = [
  { q: "720p", w: 100, note: "Laptops and tablets" },
  { q: "480p", w: 70, note: "Most phones" },
  { q: "360p", w: 48, note: "Busy mobile networks" },
  { q: "240p", w: 30, note: "The weakest signal" },
];

function UploadOnce() {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <section className="bg-black px-4 sm:px-6 py-24 sm:py-36">
      <div className="mx-auto max-w-6xl grid gap-14 lg:gap-20 lg:grid-cols-2 items-center">
        <Reveal className="order-2 lg:order-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#ffb36b]">Upload once</p>
          <h2 className="mt-3 text-[40px] sm:text-[56px] leading-[1.02] font-semibold tracking-[-0.045em] text-white">Ready for every screen.</h2>
          <p className="mt-5 text-[17px] text-white/60 leading-relaxed max-w-lg">
            A single upload becomes four qualities in one pass. Students get the sharpest picture their connection can carry, and it switches on its own when the signal changes.
          </p>
          <div ref={ref} className="mt-10 space-y-5 max-w-lg">
            {LADDER.map(({ q, w, note }, i) => (
              <div key={q}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[17px] font-semibold text-white tabular">{q}</span>
                  <span className="text-[13px] text-white/45">{note}</span>
                </div>
                <div className="mt-2 h-[3px] rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#ffd9a8] to-[#f0a586] transition-[width] duration-[1400ms] ease-[cubic-bezier(.2,.7,.2,1)]"
                    style={{ width: inView ? `${w}%` : "0%", transitionDelay: `${i * 140}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={120} className="order-1 lg:order-2">
          <div className="relative aspect-[4/5] sm:aspect-square rounded-[32px] overflow-hidden ring-1 ring-white/10">
            <Film name="fiber-burst" className="scale-[1.35]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <p className="absolute bottom-6 left-6 right-6 text-[15px] text-white/80">One upload, every viewer.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------- Speed ----------

function Speed() {
  const film = useRef<HTMLDivElement>(null);
  const ref = useScrollProgress<HTMLElement>(
    (p) => {
      if (film.current) film.current.style.transform = `translateY(${(p - 0.5) * -12}%) scale(1.25)`;
    },
    { start: 1, end: -1 },
  );
  return (
    <section id="speed" ref={ref} className="relative bg-black scroll-mt-14">
      <div className="relative h-[85svh] min-h-[560px] overflow-hidden">
        <div ref={film} className="absolute inset-0 will-change-transform">
          <Film name="light-trails" />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(55%_50%_at_50%_50%,rgba(0,0,0,0.78),rgba(0,0,0,0.25)_75%)]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black to-transparent" />
        <Reveal className="relative h-full flex flex-col items-center justify-center text-center px-6">
          <h2 className="text-[48px] sm:text-[88px] leading-[0.98] font-semibold tracking-[-0.055em] text-white">
            Fast. <span className="text-glow">Really fast.</span>
          </h2>
          <p className="mt-6 max-w-2xl text-[17px] sm:text-[20px] text-white/70 leading-relaxed">
            Every class streams from Cloudflare's global edge, close to your students. Short segments start instantly, and a weak signal means a lighter picture, never a frozen lesson.
          </p>
        </Reveal>
      </div>
      <div className="mx-auto max-w-5xl px-6 py-20 grid grid-cols-1 sm:grid-cols-3 gap-12 sm:gap-6 text-center">
        {[
          ["6 s", "segments, so play and seek feel instant"],
          ["4", "qualities, chosen live for each viewer"],
          ["Edge", "delivery, cached close to every city"],
        ].map(([big, small], i) => (
          <Reveal key={big} delay={i * 120}>
            <div className="text-[56px] sm:text-[64px] font-semibold tracking-[-0.05em] text-white leading-none">{big}</div>
            <p className="mt-3 text-[15px] text-white/50 max-w-[16rem] mx-auto">{small}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ---------- Player ----------

const PLAYER_FEATURES = ["0.75× to 2× speed", "Remembers where each student stopped", "Picture in picture", "Keyboard shortcuts", "Quality picked automatically", "Works on every phone"];

function Player() {
  return (
    <section className="bg-black px-4 sm:px-6 py-24 sm:py-36">
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2 className="text-[40px] sm:text-[64px] leading-[1.02] font-semibold tracking-[-0.045em] text-white">A player students love.</h2>
        <p className="mt-5 text-[17px] sm:text-[19px] text-white/60 leading-relaxed">Clean, quiet controls that get out of the way of the lesson.</p>
      </Reveal>
      <Reveal delay={120} className="mt-14 sm:mt-20 mx-auto max-w-5xl">
        <div className="rounded-[22px] sm:rounded-[30px] p-1.5 sm:p-2 bg-gradient-to-b from-white/[0.14] to-white/[0.03] shadow-[0_60px_140px_-50px_rgba(140,120,255,0.45)]">
          <img
            src={`${MEDIA}/player.webp`}
            alt="The dhara player streaming a lecture, with speed and quality controls"
            width={1430}
            height={804}
            loading="lazy"
            decoding="async"
            className="block w-full rounded-[18px] sm:rounded-[24px]"
          />
        </div>
      </Reveal>
      <div className="mt-12 mx-auto max-w-4xl flex flex-wrap justify-center gap-2.5">
        {PLAYER_FEATURES.map((f, i) => (
          <Reveal key={f} delay={i * 60}>
            <span className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white/[0.06] ring-1 ring-white/[0.08] text-[14px] text-white/80">
              <Check className="size-3.5 text-[#ffb36b]" strokeWidth={2.6} />
              {f}
            </span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ---------- Privacy ----------

const PRIVACY = [
  { icon: Lock, title: "Signed links", body: "Your server signs every private link, and it expires when you say. A shared URL stops working in hours, not never.", detail: "/t/9fK2…/1729764000/playlist.m3u8" },
  { icon: Globe2, title: "Locked to your website", body: "The player refuses to load anywhere but your domains, even if someone copies the embed code.", detail: "yourschool.com · allowed" },
  { icon: KeyRound, title: "One-click revoke", body: "Rotate a library's key and every link you've ever issued stops at once.", detail: "Key rotated · all links revoked" },
  { icon: UserX, title: "No student accounts", body: "Your students never sign up with us. We never see their names, numbers or emails.", detail: "0 student records stored" },
];

function Privacy() {
  return (
    <section id="privacy" className="bg-black px-4 sm:px-6 py-24 sm:py-36 scroll-mt-14">
      <div className="mx-auto max-w-6xl">
        <Reveal className="max-w-3xl">
          <p className="text-[15px] font-semibold text-[#ffb36b]">Privacy</p>
          <h2 className="mt-3 text-[40px] sm:text-[64px] leading-[1.02] font-semibold tracking-[-0.045em] text-white">Your lessons stay yours.</h2>
        </Reveal>
        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {PRIVACY.map(({ icon: Icon, title, body, detail }, i) => (
            <Reveal key={title} delay={i * 90}>
              <div className="group h-full rounded-[28px] bg-[#0d0d0f] ring-1 ring-white/[0.08] p-8 sm:p-10 transition-colors duration-500 hover:bg-[#121214]">
                <Icon className="size-7 text-[#ffb36b]" strokeWidth={1.6} />
                <h3 className="mt-8 text-[24px] font-semibold tracking-[-0.025em] text-white">{title}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-white/55">{body}</p>
                <div className="mt-8 inline-flex items-center h-9 px-3.5 rounded-full bg-white/[0.05] ring-1 ring-white/[0.07] font-mono text-[12px] text-white/50">{detail}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Developers ----------

const SIGN_SNIPPET = `import base64, hashlib, hmac, time

def signed_embed_url(library_id, video_id, key, ttl=4 * 3600):
    exp = int(time.time()) + ttl
    msg = f"{library_id}/{video_id}/{exp}".encode()
    sig = hmac.new(key.encode(), msg, hashlib.sha256).digest()
    tok = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"https://vid.dhara.app/embed/{library_id}/{video_id}?token={tok}&expires={exp}"`;

function Developers() {
  return (
    <section id="developers" className="bg-black px-4 sm:px-6 py-24 sm:py-36 scroll-mt-14">
      <div className="mx-auto max-w-6xl grid gap-14 lg:grid-cols-[1fr_1.15fr] items-center">
        <Reveal className="min-w-0">
          <p className="text-[15px] font-semibold text-[#ffb36b]">Developers</p>
          <h2 className="mt-3 text-[40px] sm:text-[56px] leading-[1.02] font-semibold tracking-[-0.045em] text-white">Built to plug in.</h2>
          <p className="mt-5 text-[17px] text-white/60 leading-relaxed">
            A REST API with organization-scoped keys, resumable uploads over the open tus protocol, and raw HLS for your own player or app. Sign links on your server in a few lines.
          </p>
        </Reveal>
        <Reveal delay={120} className="min-w-0">
          <div className="rounded-[24px] bg-[#0d0d0f] ring-1 ring-white/[0.08] overflow-hidden">
            <div className="flex items-center gap-2 px-5 h-11 border-b border-white/[0.06]">
              <span className="size-2.5 rounded-full bg-white/15" /><span className="size-2.5 rounded-full bg-white/15" /><span className="size-2.5 rounded-full bg-white/15" />
              <span className="ml-3 text-[12px] text-white/40 font-medium">sign.py</span>
            </div>
            <pre className="p-5 sm:p-6 text-[12.5px] leading-[1.75] font-mono text-white/75 overflow-x-auto"><code>{SIGN_SNIPPET}</code></pre>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------- FAQ ----------

function Faq() {
  return (
    <section id="faq" className="bg-black px-4 sm:px-6 py-24 scroll-mt-14">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <h2 className="text-[40px] sm:text-[56px] leading-[1.02] font-semibold tracking-[-0.045em] text-white text-center">Questions.</h2>
        </Reveal>
        <Reveal delay={100} className="mt-12 divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group py-6 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between gap-6 cursor-pointer list-none text-[17px] sm:text-[19px] font-medium text-white tracking-[-0.01em]">
                {q}
                <span className="size-8 shrink-0 rounded-full ring-1 ring-white/15 flex items-center justify-center text-white/60 transition-transform duration-300 group-open:rotate-45 text-[20px] leading-none">+</span>
              </summary>
              <p className="mt-4 text-[16px] leading-relaxed text-white/55 pr-12">{a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ---------- CTA (kept as designed) ----------

function Cta() {
  return (
    <section className="bg-black px-4 sm:px-6 py-24">
      <Reveal className="relative mx-auto max-w-6xl rounded-[32px] bg-[#1d1d1f] text-white px-6 py-20 sm:p-24 text-center overflow-hidden">
        <StreamCanvas variant="dark" labels={false} className="opacity-70" />
        <div className="absolute inset-0 bg-[radial-gradient(45%_70%_at_50%_50%,rgba(29,29,31,0.92),rgba(29,29,31,0.35)_70%,transparent)]" />
        <div className="relative">
          <h2 className="font-display text-[46px] sm:text-[66px] leading-[1.0]">Start streaming this week.</h2>
          <p className="mt-4 text-[16px] text-white/65 max-w-lg mx-auto">Create your account with Google, upload a class, and embed it on your site in minutes.</p>
          <Link to="/login" className="inline-block mt-9 group">
            <Button size="lg" variant="secondary" className="!bg-white !text-[#1d1d1f] !border-white">
              Start your free trial <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

export default function Landing() {
  useDarkTheme();
  return (
    <div className="min-h-dvh bg-black text-white overflow-x-clip">
      <Nav />
      <Hero />
      <Statement />
      <Product />
      <UploadOnce />
      <Speed />
      <Player />
      <Privacy />
      <Developers />
      <Faq />
      <Cta />
      <footer className="bg-black border-t border-white/[0.07]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-white/40">
          <Logo className="scale-90 origin-left" />
          <p>Made in Dhaka for educators everywhere.</p>
          <p>© {new Date().getFullYear()} dhara</p>
        </div>
      </footer>
    </div>
  );
}
