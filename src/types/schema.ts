export interface DatabaseSchema {
  tables: DatabaseTable[];
  relationships: DatabaseRelationship[];
  foreignKeys: DatabaseForeignKey[];
}

export interface DatabaseTable {
  name: string;
  columns: DatabaseColumn[];
  primaryKeys: string[];
  uniqueKeys: string[][];
}

export interface DatabaseForeignKey {
  name: string | null;
  sourceTable: string;
  sourceColumns: string[];
  targetTable: string;
  targetColumns: string[];
}

export interface DatabaseColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isAutoIncrement: boolean;
}

export interface DatabaseRelationship {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
}

export interface SuggestedRelationship {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  confidence: "high" | "medium";
  reason: string;
}
