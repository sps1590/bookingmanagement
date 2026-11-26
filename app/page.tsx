import type { Metadata } from "next";
import Link from "next/link";

import { IndustrySwitcher } from "./(marketing)/industry-switcher";

export const metadata: Metadata = {
  title: "Booking Management — appointments that run themselves",
  description:
    "Your own booking page, a diary your front desk can run, and reminders that reach people. Built for clinics, salons and workshops.",
  openGraph: {
    title: "Booking Management",
    description:
      "Your own booking page, a diary your front desk can run, and reminders that reach people.",
    type: "website",
  },
};

/**
 * The front door.
 *
 * ## Why the colours are literal rather than themed
 *
 * `globals.css` declares `@custom-variant dark (&:is(.dark *))`, so every
 * `dark:` class in this codebase only activates under an ancestor carrying
 * `.dark` — and nothing sets it. The rest of the app is therefore light-only
 * in practice, and a landing page built on those variants would render as
 * unstyled light in some places and themed in others.
 *
 * So this page states its colours outright. The hero is dark because it is
 * meant to be dark, not because a theme might be; the sections below are
 * light. It renders identically for every visitor, which for the one page
 * that decides whether somebody signs up is worth more than theme-awareness.
 *
 * ## Nothing here is invented
 *
 * No testimonials, no customer counts, no "trusted by" logos. Everything
 * claimed below is something a visitor can click through and find — the
 * terminology demo reads the live registry, and the features are the ones
 * that are built and deployed.
 */
export default function Home() {
  return (
    <div className="bg-white">
      <Nav />
      <Hero />
      <Trades />
      <Features />
      <Steps />
      <Closing />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-sm font-semibold tracking-tight text-white">
            Booking Management
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-transform hover:scale-[1.02]"
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-slate-950">
      {/* Aurora. Blurred gradient blobs rather than an image: nothing to
       download, nothing to go blurry on a high-density screen, and it
       costs no bandwidth on the mobile data most of these visitors are
       using. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/4 h-[32rem] w-[32rem] rounded-full bg-indigo-500/25 blur-[120px]" />
        <div className="absolute top-10 -right-20 h-[28rem] w-[28rem] rounded-full bg-sky-400/20 blur-[120px]" />
        <div className="absolute bottom-[-10rem] left-[-5rem] h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/15 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_30%,rgb(2_6_23)_75%)]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-6 py-24 text-center sm:py-32">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Live · no card, no setup fee
        </span>

        <h1 className="mt-7 text-4xl leading-[1.08] font-semibold tracking-tight text-white sm:text-6xl">
          Appointments that
          <br className="hidden sm:block" />{" "}
          <span className="bg-gradient-to-r from-indigo-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
            run themselves
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
          A booking page your customers can use at midnight, and a diary your front desk can
          actually run. Built for clinics, salons and workshops.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 shadow-lg shadow-black/20 transition-transform hover:scale-[1.02] sm:w-auto"
          >
            Set up your business
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/5 sm:w-auto"
          >
            I already have an account
          </Link>
        </div>

        <p className="mt-5 text-xs text-slate-400">Takes about two minutes to set up.</p>
      </div>
    </section>
  );
}

function Trades() {
  return (
    <section className="border-b border-slate-100 bg-slate-50/70 py-20">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          It speaks your trade
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">
          Pick what you do and watch every label change. Try it — this is the real thing, not a
          picture of it.
        </p>

        <div className="mt-10">
          <IndustrySwitcher />
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    title: "Two people cannot take one slot",
    body: "Enforced by the database itself, not by the page. The gaps between appointments are held too, so nobody is booked into the fifteen minutes you need to clean down.",
    icon: "shield",
  },
  {
    title: "Reminders that cost nothing",
    body: "Every booking carries a calendar invite with alarms a day and an hour before. Move the appointment and the invite updates rather than arriving twice.",
    icon: "bell",
  },
  {
    title: "A diary for the front desk",
    body: "Walk-ins at the next free slot, drag an appointment to move it, and mark people checked in, done or no-show. Repeat no-shows are counted for you.",
    icon: "calendar",
  },
  {
    title: "Customers change their own",
    body: "A private link lets somebody move or cancel within the limits you set. Your phone rings less, and the freed slot goes back on sale immediately.",
    icon: "link",
  },
  {
    title: "Nobody sees another clinic",
    body: "Every tenant is separated in the database, not in the code. A booking, a phone number and a note belong to one business and are unreachable from any other.",
    icon: "lock",
  },
  {
    title: "Your day, on your phone",
    body: "Staff see their own list with tap-to-call and the notes that matter before the person sits down. Owners see what was booked, completed and collected.",
    icon: "phone",
  },
] as const;

function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            The parts that are hard to get right
          </h2>
          <p className="mt-3 text-slate-600">
            Most of this is invisible when it works. It is very visible when it does not.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                <Icon name={feature.icon} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Tell us what you do",
    body: "Choose your trade and the whole product adopts its vocabulary. Add your services, your people and your opening hours.",
  },
  {
    n: "02",
    title: "Share your link",
    body: "You get a booking page at your own address. Put it in your bio, your shopfront, your SMS signature.",
  },
  {
    n: "03",
    title: "Work the day",
    body: "Bookings land in your diary. Check people in, take walk-ins, and let the calendar invites do the reminding.",
  },
] as const;

function Steps() {
  return (
    <section className="border-y border-slate-100 bg-slate-50/70 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Running by this afternoon
        </h2>

        <ol className="mt-12 grid gap-8 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n}>
              <span className="font-mono text-sm font-semibold text-indigo-500">{step.n}</span>
              <h3 className="mt-2 text-base font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="relative overflow-hidden bg-slate-950 py-20 sm:py-24">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Stop taking bookings by phone
        </h2>
        <p className="mt-4 text-slate-300">
          Set it up in a couple of minutes. Nothing to install, nothing to pay.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-flex items-center justify-center rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-slate-900 shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
        >
          Set up your business
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-slate-950 pb-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-white/10 px-6 pt-8 text-sm text-slate-400 sm:flex-row">
        <span className="flex items-center gap-2.5">
          <Logo />
          Booking Management
        </span>
        <span className="flex items-center gap-5">
          <Link href="/signup" className="transition-colors hover:text-white">
            Get started
          </Link>
          <Link href="/login" className="transition-colors hover:text-white">
            Sign in
          </Link>
          <a href="/api/v1/health" className="font-mono text-xs transition-colors hover:text-white">
            status
          </a>
        </span>
      </div>
    </footer>
  );
}

function Logo() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-400 to-sky-400">
      <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 text-slate-950" fill="currentColor">
        <path d="M5 1.5a.75.75 0 0 1 .75.75V3h4.5V2.25a.75.75 0 0 1 1.5 0V3h.75A1.5 1.5 0 0 1 14 4.5v8A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-8A1.5 1.5 0 0 1 3.5 3h.75v-.75A.75.75 0 0 1 5 1.5ZM3.5 6.5v6h9v-6h-9Z" />
      </svg>
    </span>
  );
}

/** Inline so the icons cost no request and cannot arrive after the text. */
function Icon({ name }: { name: (typeof FEATURES)[number]["icon"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
    "aria-hidden": true,
  };

  switch (name) {
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 1 0-12 0c0 6-3 7-3 7h18s-3-1-3-7Z" />
          <path d="M13.7 20a2 2 0 0 1-3.4 0" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
          <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <rect x="6" y="2" width="12" height="20" rx="2.5" />
          <path d="M11 18.5h2" />
        </svg>
      );
  }
}
