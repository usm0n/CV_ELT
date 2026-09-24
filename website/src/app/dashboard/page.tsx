import type { Metadata } from "next";

import { Dashboard } from "@/components/Dashboard";
import { PageHeader, Pending } from "@/components/ui";
import { loadResults } from "@/lib/data";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  const results = loadResults();
  return (
    <>
      <PageHeader eyebrow="Operator view" title="Junction dashboard">
        <p>
          Every event we detect in the sample videos, the way a city traffic centre would scan them: how many, which kind, when
          and for how long. Use the filter to focus on one class.
        </p>
      </PageHeader>
      {results ? <Dashboard results={results} /> : <Pending what="The dashboard" />}
    </>
  );
}
