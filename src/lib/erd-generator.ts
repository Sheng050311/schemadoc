import type { DatabaseSchema } from "../types/schema";

// Encode unusual SQL identifiers without introducing Mermaid syntax or collisions.
function diagramName(name: string): string {
  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(name) && !name.startsWith("encoded_")) return name;
  return `encoded_${Array.from(name, (character) => character.codePointAt(0)!.toString(16)).join("_")}`;
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
  for (const relationship of schema.relationships) {
    if (!names.has(relationship.sourceTable) || !names.has(relationship.targetTable)) {
      throw new Error("Cannot draw a relationship to a table missing from the schema.");
    }
    // Initial visualization uses the requested one-to-many convention.
    lines.push(`  ${diagramName(relationship.targetTable)} ||--o{ ${diagramName(relationship.sourceTable)} : "has"`);
  }
  return lines.join("\n");
}
