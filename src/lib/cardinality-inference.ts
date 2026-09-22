import type { DatabaseForeignKey, DatabaseSchema, DatabaseTable } from "../types/schema";

export interface RelationshipCardinality {
  foreignKey: DatabaseForeignKey;
  /** Number of target rows referenced by one source row. */
  sourceMin: 0 | 1 | "unknown";
  sourceMax: 1 | "unknown";
  /** Number of source rows referencing one target row. */
  targetMin: 0 | 1 | "unknown";
  targetMax: 1 | "many" | "unknown";
  reason: string[];
}

const normalize = (name: string) => name.toLowerCase();

function completeKey(table: DatabaseTable, columns: string[]): boolean {
  const expected = new Set(columns.map(normalize));
  return [table.primaryKeys, ...(table.uniqueKeys ?? [])].some((key) =>
    Array.isArray(key) && key.length === columns.length &&
    new Set(key.map(normalize)).size === key.length &&
    key.every((name) => expected.has(normalize(name))),
  );
}

/** Infers declared FK bounds, assuming valid constraints are enforced, not row counts. */
export function inferRelationshipCardinality(
  schema: DatabaseSchema,
  foreignKey: DatabaseForeignKey,
): RelationshipCardinality {
  const result: RelationshipCardinality = {
    foreignKey, sourceMin: "unknown", sourceMax: "unknown",
    targetMin: "unknown", targetMax: "unknown", reason: [],
  };
  const source = schema.tables.filter((table) => normalize(table.name) === normalize(foreignKey.sourceTable));
  const target = schema.tables.filter((table) => normalize(table.name) === normalize(foreignKey.targetTable));
  if (source.length !== 1) result.reason.push("Source table is missing or ambiguous.");
  if (target.length !== 1) result.reason.push("Target table is missing or ambiguous.");
  const sourceNames = foreignKey.sourceColumns;
  const targetNames = foreignKey.targetColumns;
  if (!sourceNames.length || sourceNames.length !== targetNames.length ||
      new Set(sourceNames.map(normalize)).size !== sourceNames.length ||
      new Set(targetNames.map(normalize)).size !== targetNames.length) {
    result.reason.push("Foreign-key column lists must be nonempty, equally sized, and contain no duplicate columns.");
  }
  if (result.reason.length) return result;

  const sourceColumns = sourceNames.map((name) => source[0].columns.filter((column) => normalize(column.name) === normalize(name)));
  const targetColumns = targetNames.map((name) => target[0].columns.filter((column) => normalize(column.name) === normalize(name)));
  if (sourceColumns.some((columns) => columns.length !== 1)) result.reason.push("A source column is missing or ambiguous.");
  if (targetColumns.some((columns) => columns.length !== 1)) result.reason.push("A target column is missing or ambiguous.");
  if (!completeKey(target[0], targetNames)) result.reason.push("Referenced columns are not a complete known target primary or unique key.");
  if (result.reason.length) return result;

  result.sourceMax = 1;
  result.reason.push("The grouped FK references a complete known target key, so a source row references at most one target row.");
  if (sourceColumns.some(([column]) => typeof column.nullable !== "boolean")) {
    result.reason.push("Source nullability metadata is incomplete.");
  } else {
    result.sourceMin = sourceColumns.some(([column]) => column.nullable) ? 0 : 1;
    result.reason.push(result.sourceMin === 0
      ? "At least one source FK column is nullable, so a target reference is optional."
      : "All source FK columns are NOT NULL, so a target reference is required.");
  }
  if (completeKey(source[0], sourceNames)) {
    result.targetMax = 1;
    result.reason.push("The complete source FK column set matches a primary or unique key, limiting each target to at most one source row.");
  } else {
    result.reason.push("No matching source unique key is recorded, but the model does not certify UNIQUE metadata completeness; the target maximum remains unknown rather than many.");
  }
  result.reason.push("The schema does not prove that every target has a referencing source; target minimum remains unknown.");
  return result;
}
