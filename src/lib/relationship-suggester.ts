import type { DatabaseSchema, DatabaseTable, SuggestedRelationship } from "../types/schema";

const normalize = (name: string) => name.toLowerCase();

function compatibleTypes(source: string, target: string): boolean {
  // Ignore case/spacing and integer display width, but retain integer family,
  // string length, decimal precision, and any modifiers present in the model.
  const canonical = (type: string) => type.toUpperCase().replace(/\s+/g, "")
    .replace(/^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)\(\d+\)/, "$1");
  return canonical(source) === canonical(target);
}

function isPrimaryKey(table: DatabaseTable, column: DatabaseTable["columns"][number]): boolean {
  return column.isPrimaryKey || table.primaryKeys.some((name) => normalize(name) === normalize(column.name));
}

function relationshipKey(relationship: {
  sourceTable: string; sourceColumn: string; targetTable: string; targetColumn: string;
}): string {
  return JSON.stringify([relationship.sourceTable, relationship.sourceColumn,
    relationship.targetTable, relationship.targetColumn].map(normalize));
}

/** Returns suggestions only; never changes schema.relationships or column flags. */
export function suggestRelationships(schema: DatabaseSchema): SuggestedRelationship[] {
  const suggestions: SuggestedRelationship[] = [];
  const seen = new Set(schema.relationships.map(relationshipKey));
  const candidateTables = new Map<string, Set<string>>();
  const sourceKey = (table: string, column: string) => JSON.stringify([table, column].map(normalize));

  for (const source of schema.tables) {
    for (const column of source.columns) {
      const sourceName = normalize(column.name);
      // Primary-key columns and generic identifiers are deliberately excluded.
      if (isPrimaryKey(source, column) || sourceName === "id") continue;
      const entity = sourceName.match(/^([a-z][a-z0-9_]*?)(?:_?id)$/)?.[1];
      const targetNames = entity ? new Set([entity, `tbl${entity}`, `${entity}s`]) : new Set<string>();

      for (const target of schema.tables) {
        if (normalize(source.name) === normalize(target.name)) continue;
        for (const targetColumn of target.columns) {
          if (!isPrimaryKey(target, targetColumn)) continue;
          const targetName = normalize(targetColumn.name);
          const exact = sourceName === targetName;
          if (!exact && !(targetName === "id" && targetNames.has(normalize(target.name)))) continue;

          const suggestion: SuggestedRelationship = {
            sourceTable: source.name,
            sourceColumn: column.name,
            targetTable: target.name,
            targetColumn: targetColumn.name,
            confidence: exact ? "high" : "medium",
            reason: exact
              ? `Column "${column.name}" matches primary key "${target.name}.${targetColumn.name}" (case-insensitive).`
              : `Column "${column.name}" has an ID suffix and entity "${entity}" matches table "${target.name}", which has primary key "${targetColumn.name}".`,
          };
          const key = relationshipKey(suggestion);
          if (seen.has(key)) continue;
          seen.add(key);
          const sourceId = sourceKey(suggestion.sourceTable, suggestion.sourceColumn);
          const targets = candidateTables.get(sourceId) ?? new Set<string>();
          targets.add(normalize(target.name));
          candidateTables.set(sourceId, targets);
          if (!compatibleTypes(column.dataType, targetColumn.dataType)) {
            suggestion.confidence = "medium";
            suggestion.reason += ` Data types differ: ${column.dataType} versus ${targetColumn.dataType}.`;
          }
          suggestions.push(suggestion);
        }
      }
    }
  }
  for (const suggestion of suggestions) {
    const count = candidateTables.get(sourceKey(suggestion.sourceTable, suggestion.sourceColumn))!.size;
    if (count > 1) {
      suggestion.confidence = "medium";
      suggestion.reason += ` Ambiguous match: ${count} candidate target tables.`;
    } else if (suggestion.confidence === "high") {
      suggestion.reason += " Only one candidate target table and compatible data types.";
    }
  }
  return suggestions;
}
