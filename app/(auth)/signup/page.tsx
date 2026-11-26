import { Suspense } from "react";
import type { Metadata } from "next";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your business" };

export default function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>;
}) {
  // The form itself is the same for everybody and is prerendered.
  // Only the notices driven by the query string need this request.
  return (
    <Suspense fallback={null}>
      <SignupPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignupPageContent({ searchParams }: { searchParams: Promise<{ resume?: string }> }) {
  const { resume } = await searchParams;
  return <SignupForm resume={resume === "1"} />;
}
