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
  const [showAttributes, setShowAttributes] = useState(true);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<{ schema: DatabaseSchema; names: Set<string> } | null>(null);
  const selectedNames = useMemo(() => selection?.schema === schema ? selection.names : new Set(schema.tables.map((table) => table.name)), [schema, selection]);
  const listedTables = schema.tables.filter((table) => table.name.toLowerCase().includes(search.toLowerCase()));
  const selectedSchema = useMemo(() => ({
    tables: schema.tables.filter((table) => selectedNames.has(table.name)),
    relationships: schema.relationships.filter((relationship) => selectedNames.has(relationship.sourceTable) && selectedNames.has(relationship.targetTable)),
  }), [schema, selectedNames]);
  const selectedSuggestions = useMemo(() => suggestions.filter((relationship) => selectedNames.has(relationship.sourceTable) && selectedNames.has(relationship.targetTable)), [suggestions, selectedNames]);
  const graph = useMemo(() => generateConceptualGraph(selectedSchema, selectedSuggestions, relationshipSource), [selectedSchema, selectedSuggestions, relationshipSource]);
  const visibleGraph = useMemo(() => {
    if (showAttributes) return graph;
    const nodes = graph.nodes.filter((node) => node.type !== "attribute");
    const visibleIds = new Set(nodes.map((node) => node.id));
    return { nodes, edges: graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)) };
  }, [graph, showAttributes]);
  // A new schema resets the uncontrolled canvas; dragging never mutates SQL data.
  const graphKey = useMemo(() => JSON.stringify([selectedSchema, selectedSuggestions, relationshipSource, showAttributes]), [selectedSchema, selectedSuggestions, relationshipSource, showAttributes]);
  return (
    <div className="mt-4 space-y-3">
      <section aria-label="Select tables for conceptual ERD" className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-48">
            <label htmlFor="conceptual-table-search" className="mb-1 block text-sm font-medium">Search tables</label>
            <input id="conceptual-table-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter by table name" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600" />
          </div>
          <button type="button" onClick={() => setSelection({ schema, names: new Set(schema.tables.map((table) => table.name)) })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600">Select All</button>
          <button type="button" onClick={() => setSelection({ schema, names: new Set() })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600">Clear</button>
        </div>
        <p role="status" className="my-3 text-xs text-slate-600">{selectedSchema.tables.length} of {schema.tables.length} tables selected</p>
        <div className="max-h-44 overflow-y-auto">
          {listedTables.length ? <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {listedTables.map((table, index) => <li key={`${table.name}-${index}`}>
              <label className="flex items-start gap-2 rounded p-1 text-sm">
                <input type="checkbox" checked={selectedNames.has(table.name)} onChange={(event) => {
                  const names = new Set(selectedNames);
                  if (event.target.checked) names.add(table.name); else names.delete(table.name);
                  setSelection({ schema, names });
                }} className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600" />
                <span className="min-w-0 break-all font-mono">{table.name}</span>
              </label>
            </li>)}
          </ul> : <p className="text-sm text-slate-500">No tables match your search.</p>}
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="conceptual-relationship-source" className="text-sm font-medium">Relationship source</label>
        <select id="conceptual-relationship-source" value={relationshipSource} onChange={(event) => setRelationshipSource(event.target.value as RelationshipSourceMode)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600">
          <option value="defined">Defined only</option>
          <option value="high">Defined + High-confidence suggestions</option>
          <option value="all">Defined + All suggestions</option>
        </select>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={showAttributes} onChange={(event) => setShowAttributes(event.target.checked)} className="h-4 w-4 accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" />
          Show Attributes
        </label>
      </div>
      <ul aria-label="Conceptual ERD legend" className="flex flex-wrap gap-x-5 gap-y-3 text-xs text-slate-600">
        <li className="flex items-center gap-2"><span aria-hidden="true" className="h-4 w-6 border-2 border-indigo-600 bg-indigo-50" />Entity</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="h-4 w-6 rounded-[50%] border border-slate-400 bg-white" />Attribute</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="mx-1 h-3 w-3 rotate-45 border-2 border-amber-700 bg-amber-50" />Defined Relationship</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="mx-1 h-3 w-3 rotate-45 border-2 border-dashed border-teal-700 bg-teal-50" />Suggested Relationship</li>
      </ul>
      <p className="text-sm text-slate-600">Drag nodes to arrange them; pan or zoom to explore. Hide attributes to focus on entities and relationships.</p>
      {graph.missingRelationships > 0 && <p role="status" className="text-sm text-amber-800">Some relationships cannot be drawn because their referenced tables are missing.</p>}
      <div role="region" aria-label="Interactive conceptual ERD" className="h-[560px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:h-[700px]">
        {selectedSchema.tables.length === 0 ? <p role="status" className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-600">Select at least one table to view the conceptual ERD.</p> : <ReactFlow key={graphKey} defaultNodes={visibleGraph.nodes} defaultEdges={visibleGraph.edges} nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.02} maxZoom={2}
          nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
          onlyRenderVisibleElements>
          <Background />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!hidden sm:!block" />
        </ReactFlow>}
      </div>
      <p className="text-xs text-slate-500">Primary-key attributes are underlined. Hover over a relationship diamond for its column endpoints. Node positions reset and the view refits when the schema, selected tables, relationship source, or attribute visibility changes.</p>
    </div>
  );
}
