import type { DatabaseSchema } from "../types/schema";

function escapeMarkdown(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+.!|~-])/g, "\\$1").replace(/\r\n|\r|\n/g, "<br>");
}

function code(value: string): string {
  const text = value.replace(/\r\n|\r|\n/g, " ");
  const fence = "`".repeat(Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1);
  return `${fence} ${text} ${fence}`;
}

export function generateMarkdownDocumentation(schema: DatabaseSchema): string {
  const lines = [
    "# Database Documentation", "", "## Overview", "",
    `- Tables: ${schema.tables.length}`,
    `- Columns: ${schema.tables.reduce((count, table) => count + table.columns.length, 0)}`,
    `- Relationships: ${schema.relationships.length}`, "", "## Tables", "",
  ];
  for (const table of schema.tables) {
    lines.push(`### ${escapeMarkdown(table.name)}`, "",
      "| Column | Type | Attributes | Default |",
      "| ------ | ---- | ---------- | ------- |");
    for (const column of table.columns) {
      const attributes = [column.isPrimaryKey && "PK", column.isForeignKey && "FK",
        !column.nullable && "NOT NULL", column.isAutoIncrement && "AUTO_INCREMENT"].filter(Boolean).join(", ");
      lines.push(`| ${escapeMarkdown(column.name)} | ${escapeMarkdown(column.dataType)} | ${attributes || "—"} | ${column.defaultValue === null ? "—" : escapeMarkdown(column.defaultValue)} |`);
    }
    lines.push("");
  }
  lines.push("## Relationships", "");
  if (!schema.relationships.length) lines.push("No defined foreign-key relationships were found.");
  for (const relationship of schema.relationships) {
    lines.push(`- ${code(`${relationship.sourceTable}.${relationship.sourceColumn}`)} → ${code(`${relationship.targetTable}.${relationship.targetColumn}`)}`);
  }
  return lines.join("\n") + "\n";
}
