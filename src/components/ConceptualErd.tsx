"use client";

import { useMemo } from "react";
import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { DatabaseSchema } from "@/types/schema";
import { generateConceptualGraph } from "@/lib/conceptual-graph";
import { AttributeNode, EntityNode, RelationshipNode } from "./conceptual-nodes";

const nodeTypes = { entity: EntityNode, attribute: AttributeNode, relationship: RelationshipNode };

export default function ConceptualErd({ schema }: { schema: DatabaseSchema }) {
  const graph = useMemo(() => generateConceptualGraph(schema), [schema]);
  // A new schema resets the uncontrolled canvas; dragging never mutates SQL data.
  const graphKey = useMemo(() => JSON.stringify(schema), [schema]);
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-slate-600">Rectangles are entities, ovals are attributes, and diamonds are defined relationships. Drag nodes to arrange them; pan or zoom to explore. Suggested relationships are excluded.</p>
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
      <p className="text-xs text-slate-500">Primary-key attributes are underlined. Hover over a relationship diamond for its column endpoints. Node positions reset when the schema changes or this view is reopened.</p>
    </div>
  );
}
