import type { Edge, Node } from "@xyflow/react";
import type { DatabaseSchema, SuggestedRelationship } from "../types/schema";
import { inferRelationshipCardinality } from "./cardinality-inference";

export type RelationshipSourceMode = "defined" | "high" | "all";
type ConceptualNodeData = { label: string; primaryKey?: boolean; description?: string; suggested?: boolean; confidence?: SuggestedRelationship["confidence"] };
export type ConceptualNode = Node<ConceptualNodeData, "entity" | "attribute" | "relationship">;

function relationshipKey(relationship: { sourceTable: string; sourceColumn: string; targetTable: string; targetColumn: string }) {
  return JSON.stringify([relationship.sourceTable, relationship.sourceColumn, relationship.targetTable, relationship.targetColumn].map((value) => value.toLowerCase()));
}

function cardinalityLabel(min: 0 | 1 | "unknown", max: 1 | "many" | "unknown"): string | undefined {
  if (min !== "unknown" && max !== "unknown" && max !== "many") return `${min}..${max}`;
  if (min !== "unknown") return String(min);
  if (max === 1) return "1";
  return undefined;
}

export function generateConceptualGraph(schema: Pick<DatabaseSchema, "tables" | "relationships" | "foreignKeys">, suggestions: SuggestedRelationship[] = [], relationshipSource: RelationshipSourceMode = "defined") {
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
  const definedKeys = new Set(schema.relationships.map(relationshipKey));
  const selectedSuggestions = relationshipSource === "defined"
    ? []
    : suggestions.filter((suggestion) => relationshipSource === "all" || suggestion.confidence === "high");
  const relationships = [
    ...schema.foreignKeys.map((relationship) => ({ relationship, suggested: false as const })),
    ...selectedSuggestions
      .filter((suggestion) => !definedKeys.has(relationshipKey(suggestion)))
      .map((suggestion) => ({ relationship: suggestion, suggested: true as const })),
  ];
  relationships.forEach(({ relationship, suggested }, index) => {
    const source = tableIds.get(relationship.sourceTable);
    const target = tableIds.get(relationship.targetTable);
    if (!source || !target) { missingRelationships++; return; }
    const id = `relationship-${index}`;
    // Defined relationships use the grouped FK so composite keys receive one diamond and one inference result.
    const cardinality = suggested ? undefined : inferRelationshipCardinality(schema, relationship);
    const sourceLabel = cardinality && cardinalityLabel(cardinality.targetMin, cardinality.targetMax);
    const targetLabel = cardinality && cardinalityLabel(cardinality.sourceMin, cardinality.sourceMax);
    const labelStyle = { fill: "#475569", fontSize: 12, fontWeight: 600 };
    nodes.push({ id, type: "relationship", position: { x: (index % columns) * clusterWidth + 100, y: relationshipY + Math.floor(index / columns) * 160 },
      data: { label: suggested ? `Suggested${"confidence" in relationship ? ` (${relationship.confidence})` : ""}` : "references", suggested, description: `${relationship.sourceTable}.${suggested ? relationship.sourceColumn : relationship.sourceColumns.join(", ")} references ${relationship.targetTable}.${suggested ? relationship.targetColumn : relationship.targetColumns.join(", ")}` }, style: { width: 160, height: 100 } });
    edges.push(
      { id: `${id}-source`, source, target: id, sourceHandle: "out", targetHandle: "in", label: sourceLabel, labelStyle, labelBgStyle: { fill: "#f8fafc", fillOpacity: 0.9 }, labelBgPadding: [3, 2], style: { stroke: suggested ? "#0f766e" : "#b45309", strokeDasharray: suggested ? "6 4" : undefined } },
      { id: `${id}-target`, source: id, target, sourceHandle: "out", targetHandle: "in", label: targetLabel, labelStyle, labelBgStyle: { fill: "#f8fafc", fillOpacity: 0.9 }, labelBgPadding: [3, 2], style: { stroke: suggested ? "#0f766e" : "#b45309", strokeDasharray: suggested ? "6 4" : undefined } },
    );
  });
  return { nodes, edges, missingRelationships };
}
