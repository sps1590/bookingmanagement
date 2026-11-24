import Link from "next/link";

const phases = [
  { id: 0, name: "Foundations & environment", status: "in progress" },
  { id: 1, name: "Database core & multi-tenancy", status: "next" },
  { id: 2, name: "Scheduling engine", status: "planned" },
  { id: 3, name: "Public booking portal", status: "planned" },
  { id: 4, name: "Admin dashboard & booking ops (MVP)", status: "planned" },
  { id: 5, name: "Notification & reminder engine", status: "planned" },
  { id: 6, name: "Self-service manage & exports", status: "planned" },
  { id: 7, name: "Staff portal & RBAC hardening", status: "planned" },
  { id: 8, name: "Plans, quotas & payments", status: "planned" },
  { id: 9, name: "Waitlist, analytics & Super Admin", status: "planned" },
  { id: 10, name: "Hardening, QA & launch", status: "planned" },
];

const statusStyles: Record<string, string> = {
  "in progress": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  next: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  planned: "bg-neutral-500/10 text-neutral-500",
};

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
        Scaffold · Phase 0
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Booking Management</h1>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
        Multi-tenant SaaS booking and appointment platform. This placeholder is replaced by the
        marketing site and tenant portals in later phases — see{" "}
        <code className="bg-muted rounded px-1.5 py-0.5 text-xs">docs/DEVELOPMENT_PLAN.md</code>.
      </p>

      <ol className="mt-10 space-y-1">
        {phases.map((phase) => (
          <li
            key={phase.id}
            className="flex items-center gap-3 border-b border-dashed py-2.5 text-sm last:border-0"
          >
            <span className="text-muted-foreground w-6 font-mono text-xs">{phase.id}</span>
            <span className="flex-1">{phase.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyles[phase.status]}`}
            >
              {phase.status}
            </span>
          </li>
        ))}
      </ol>

      <p className="text-muted-foreground mt-10 text-xs">
        Health check:{" "}
        <Link className="underline underline-offset-4" href="/api/v1/health">
          /api/v1/health
        </Link>
      </p>
    </main>
  );
}
