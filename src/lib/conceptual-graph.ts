import type { Edge, Node } from "@xyflow/react";
import type { DatabaseSchema } from "../types/schema";

export type ConceptualNode = Node<{ label: string; primaryKey?: boolean; description?: string }, "entity" | "attribute" | "relationship">;

export function generateConceptualGraph(schema: DatabaseSchema) {
  const nodes: ConceptualNode[] = [];
  const edges: Edge[] = [];
  const columns = Math.max(1, Math.ceil(Math.sqrt(schema.tables.length)));
  const widths = schema.tables.map((table) => Math.max(200, ...[table.name, ...table.columns.map((column) => column.name)].map((name) => name.length * 9 + 40)));
  const clusterWidth = Math.max(720, ...widths.map((width) => width * 2 + 160));
  const clusterHeight = Math.max(320, ...schema.tables.map((table) => 180 + Math.ceil(table.columns.length / 2) * 85));
  const tableIds = new Map<string, string>();
  schema.tables.forEach((table, index) => {
    const id = `entity-${index}`;
    tableIds.set(table.name, id);
    const x = (index % columns) * clusterWidth;
    const y = Math.floor(index / columns) * clusterHeight;
    const width = widths[index];
    nodes.push({ id, type: "entity", position: { x: x + (clusterWidth - width) / 2, y }, data: { label: table.name }, style: { width, height: 56 } });
    table.columns.forEach((column, columnIndex) => {
      const attributeId = `attribute-${index}-${columnIndex}`;
      nodes.push({ id: attributeId, type: "attribute", position: { x: x + 40 + (columnIndex % 2) * (clusterWidth / 2), y: y + 115 + Math.floor(columnIndex / 2) * 85 },
        data: { label: column.name, primaryKey: column.isPrimaryKey }, style: { width, height: 52 } });
      edges.push({ id: `attribute-edge-${index}-${columnIndex}`, source: id, target: attributeId, sourceHandle: "attributes", targetHandle: "in", type: "smoothstep", style: { stroke: "#94a3b8" } });
    });
  });
  let missingRelationships = 0;
  const relationshipY = Math.ceil(schema.tables.length / columns) * clusterHeight;
  schema.relationships.forEach((relationship, index) => {
    const source = tableIds.get(relationship.sourceTable);
    const target = tableIds.get(relationship.targetTable);
    if (!source || !target) { missingRelationships++; return; }
    const id = `relationship-${index}`;
    nodes.push({ id, type: "relationship", position: { x: (index % columns) * clusterWidth + 100, y: relationshipY + Math.floor(index / columns) * 160 },
      data: { label: "references", description: `${relationship.sourceTable}.${relationship.sourceColumn} references ${relationship.targetTable}.${relationship.targetColumn}` }, style: { width: 160, height: 100 } });
    edges.push(
      { id: `${id}-source`, source, target: id, sourceHandle: "out", targetHandle: "in", style: { stroke: "#b45309" } },
      { id: `${id}-target`, source: id, target, sourceHandle: "out", targetHandle: "in", style: { stroke: "#b45309" } },
    );
  });
  return { nodes, edges, missingRelationships };
}
