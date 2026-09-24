import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const metadata: Metadata = { title: "Report" };

export default function ReportPage() {
  const md = readFileSync(path.join(process.cwd(), "src", "content", "report.md"), "utf8");
  return (
    <article className="prose-report mx-auto max-w-3xl">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </article>
  );
}
