import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Booking Management",
  description:
    "Online appointment booking for clinics, salons and workshops. Your own booking page, a diary your front desk can run, and reminders that reach people.",
};

/**
 * The front door.
 *
 * Until now this was the Phase 0 scaffold, which listed every phase as
 * "planned" and was the first thing a visitor saw — including a tenant
 * arriving from a link to sign up. What is described below is what is built
 * and deployed; nothing here promises a feature that does not exist.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight">Booking Management</h1>
      <p className="mt-4 text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
        A booking page for your business, and a diary your front desk can actually run. Built for
        clinics, salons and workshops.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-neutral-900 px-5 py-3 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Set up your business
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800"
        >
          Sign in
        </Link>
      </div>

      <section className="mt-16 space-y-8">
        <Feature
          title="A booking page that speaks your trade"
          body="A dentist's screens say Patient and Dental Appointment; a salon's say Client and Stylist. Same software, your words — chosen once when you sign up."
        />
        <Feature
          title="Two people cannot take the same slot"
          body="Enforced by the database, not by the page. Gaps between appointments are held too, so nobody is booked into the fifteen minutes you need to clean down."
        />
        <Feature
          title="Walk-ins, check-in, no-shows"
          body="Take a booking at the desk for the next free slot, move one by dragging it, and mark people checked in, done or no-show. Repeat no-shows are counted, so you know who to ask for a deposit."
        />
        <Feature
          title="Reminders that cost nothing to send"
          body="Every booking carries a calendar invite with alarms a day and an hour before. Change the time and the invite updates rather than arriving twice. Email confirmations on top, if you want them."
        />
        <Feature
          title="Customers change their own bookings"
          body="A private link lets someone move or cancel their appointment within the limits you set — so your phone rings less, and the slot goes back on sale straight away."
        />
      </section>

      <p className="mt-16 text-xs text-neutral-500">
        Health check: <code className="font-mono">/api/v1/health</code>
      </p>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{body}</p>
    </div>
  );
}
