import type { DatabaseSchema } from "../types/schema";
import { inferRelationshipCardinality } from "./cardinality-inference";

// Encode unusual SQL identifiers without introducing Mermaid syntax or collisions.
function diagramName(name: string): string {
  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(name) && !name.startsWith("encoded_")) return name;
  return `encoded_${Array.from(name, (character) => character.codePointAt(0)!.toString(16)).join("_")}`;
}

function mermaidCardinality(min: 0 | 1 | "unknown", max: 1 | "many" | "unknown"): "||" | "o|" | "o{" {
  if (min === 1 && max === 1) return "||";
  if (max === 1) return "o|";
  // Mermaid has no unknown endpoint marker. Use its broad optional-many form
  // instead of implying a required or one-to-one bound that is not proven.
  return "o{";
}

export function generateMermaidErd(schema: DatabaseSchema): string {
  const lines = ["erDiagram"];
  const names = new Set(schema.tables.map((table) => table.name));
  for (const table of schema.tables) {
    lines.push(`  ${diagramName(table.name)} {`);
    for (const column of table.columns) {
      // Use base SQL types: Mermaid does not accept DECIMAL's precision comma.
      const dataType = column.dataType.match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? "UNKNOWN";
      const keys = [column.isPrimaryKey ? "PK" : null, column.isForeignKey ? "FK" : null].filter(Boolean);
      lines.push(`    ${dataType} ${diagramName(column.name)}${keys.length ? ` ${keys.join(", ")}` : ""}`);
    }
    lines.push("  }");
  }
  for (const foreignKey of schema.foreignKeys) {
    if (!names.has(foreignKey.sourceTable) || !names.has(foreignKey.targetTable)) {
      throw new Error("Cannot draw a relationship to a table missing from the schema.");
    }
    const cardinality = inferRelationshipCardinality(schema, foreignKey);
    const targetEnd = mermaidCardinality(cardinality.sourceMin, cardinality.sourceMax);
    const sourceEnd = mermaidCardinality(cardinality.targetMin, cardinality.targetMax);
    lines.push(`  ${diagramName(foreignKey.targetTable)} ${targetEnd}--${sourceEnd} ${diagramName(foreignKey.sourceTable)} : "has"`);
  }
  return lines.join("\n");
}
