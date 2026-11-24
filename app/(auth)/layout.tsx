import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <Link href="/" className="font-semibold tracking-tight">
          Booking Management
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        {children}
      </main>
    </div>
  );
}
