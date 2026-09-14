"use client";

import { useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { DatabaseSchema, SuggestedRelationship } from "@/types/schema";
import { generateConceptualGraph, type RelationshipSourceMode } from "@/lib/conceptual-graph";
import { AttributeNode, EntityNode, RelationshipNode } from "./conceptual-nodes";

const nodeTypes = { entity: EntityNode, attribute: AttributeNode, relationship: RelationshipNode };

export default function ConceptualErd({ schema, suggestions }: { schema: DatabaseSchema; suggestions: SuggestedRelationship[] }) {
  const [relationshipSource, setRelationshipSource] = useState<RelationshipSourceMode>("high");
  const graph = useMemo(() => generateConceptualGraph(schema, suggestions, relationshipSource), [schema, suggestions, relationshipSource]);
  // A new schema resets the uncontrolled canvas; dragging never mutates SQL data.
  const graphKey = useMemo(() => JSON.stringify([schema, suggestions, relationshipSource]), [schema, suggestions, relationshipSource]);
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="conceptual-relationship-source" className="text-sm font-medium">Relationship source</label>
        <select id="conceptual-relationship-source" value={relationshipSource} onChange={(event) => setRelationshipSource(event.target.value as RelationshipSourceMode)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600">
          <option value="defined">Defined only</option>
          <option value="high">Defined + High-confidence suggestions</option>
          <option value="all">Defined + All suggestions</option>
        </select>
      </div>
      <p className="text-sm text-slate-600">Rectangles are entities, ovals are attributes, and solid diamonds are defined relationships. Dashed teal diamonds are suggested relationships. Drag nodes to arrange them; pan or zoom to explore.</p>
      {graph.missingRelationships > 0 && <p role="status" className="text-sm text-amber-800">Some relationships cannot be drawn because their referenced tables are missing.</p>}
      <div role="region" aria-label="Interactive conceptual ERD" className="h-[560px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:h-[700px]">
        <ReactFlow key={graphKey} defaultNodes={graph.nodes} defaultEdges={graph.edges} nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.02} maxZoom={2}
          nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
          onlyRenderVisibleElements>
          <Background />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!hidden sm:!block" />
        </ReactFlow>
      </div>
      <p className="text-xs text-slate-500">Primary-key attributes are underlined. Hover over a relationship diamond for its column endpoints. Node positions reset when the schema or relationship source changes.</p>
    </div>
  );
}
