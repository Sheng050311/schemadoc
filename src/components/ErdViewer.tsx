"use client";

import { useEffect, useRef, useState } from "react";
import { generateMermaidErd } from "@/lib/erd-generator";
import type { DatabaseSchema } from "@/types/schema";

export default function ErdViewer({ schema }: { schema: DatabaseSchema }) {
  const container = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ schema: DatabaseSchema; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const target = container.current;
    target?.replaceChildren();
    async function renderDiagram() {
      try {
        const code = generateMermaidErd(schema);
        const { default: mermaid } = await import("mermaid");
        if (cancelled) return;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: "default",
          er: { useMaxWidth: false },
        });
        const { svg } = await mermaid.render(`erd-${crypto.randomUUID()}`, code);
        if (cancelled || !target) return;
        // Insert only Mermaid's strict-mode SVG, never raw SQL as HTML.
        target.innerHTML = svg;
        setResult({ schema, error: null });
      } catch (cause) {
        if (cancelled) return;
        target?.replaceChildren();
        setResult({ schema, error: cause instanceof Error ? cause.message : "Please try generating the documentation again." });
      }
    }
    void renderDiagram();
    return () => { cancelled = true; target?.replaceChildren(); };
  }, [schema]);

  const current = result?.schema === schema ? result : null;
  return (
    <div className="mt-4 min-w-0">
      {!current && <p role="status" className="text-sm text-slate-500">Rendering diagram…</p>}
      {current?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not render the diagram. {current.error}</p>}
      <div ref={container} role="region" aria-label="Database entity relationship diagram" aria-busy={!current} tabIndex={0}
        className="max-w-full overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-indigo-600 [&_svg]:mx-auto [&_svg]:max-w-none" />
    </div>
  );
}
