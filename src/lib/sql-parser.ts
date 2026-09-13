import type {
  DatabaseColumn,
  DatabaseSchema,
  DatabaseTable,
} from "../types/schema";

const identifier = (token: string) =>
  token.startsWith("`") ? token.slice(1, -1).replaceAll("``", "`") : token;

function tokenize(sql: string): string[] {
  // Match quoted values before comments so "--" inside a string is preserved.
  return (
    sql.match(/'(?:\\.|''|[^'\\])*'|"(?:\\.|""|[^"\\])*"|`(?:``|[^`])*`|--[^\r\n]*|[\w$]+|[^\s]/g) ?? []
  ).filter((token) => !token.startsWith("--"));
}

function splitDefinitions(tokens: string[]): string[][] {
  const definitions: string[][] = [];
  let current: string[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token === "," && depth === 0) {
      if (current.length) definitions.push(current);
      current = [];
      continue;
    }
    if (token === "(") depth++;
    if (token === ")") depth--;
    current.push(token);
  }
  if (current.length) definitions.push(current);
  return definitions;
}

function closingParen(tokens: string[], start: number): number {
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    if (tokens[index] === "(") depth++;
    if (tokens[index] === ")" && --depth === 0) return index;
  }
  throw new Error("Unclosed parenthesis in CREATE TABLE statement.");
}

function columnNames(tokens: string[], start: number): string[] {
  const end = closingParen(tokens, start);
  return splitDefinitions(tokens.slice(start + 1, end)).map((part) =>
    identifier(part[0]),
  );
}

function parseColumn(tokens: string[]): DatabaseColumn {
  let index = 2;
  let dataType = tokens[1].toUpperCase();
  if (tokens[index] === "(") {
    const end = closingParen(tokens, index);
    dataType += tokens.slice(index, end + 1).join("");
    index = end + 1;
  }

  let nullable = true;
  let isPrimaryKey = false;
  let defaultValue: string | null = null;
  while (index < tokens.length) {
    const keyword = tokens[index].toUpperCase();
    const next = tokens[index + 1]?.toUpperCase();
    if (keyword === "NOT" && next === "NULL") nullable = false;
    if (keyword === "PRIMARY" && next === "KEY") isPrimaryKey = true;
    if (keyword === "DEFAULT") {
      const start = ++index;
      if (index >= tokens.length) throw new Error("DEFAULT requires a value.");
      if (tokens[index] === "+" || tokens[index] === "-") index++;
      if (tokens[index] === "(") {
        index = closingParen(tokens, index);
      } else {
        // Decimal literals and function defaults such as CURRENT_TIMESTAMP().
        if (tokens[index + 1] === ".") index += 2;
        if (tokens[index + 1] === "(") {
          index = closingParen(tokens, index + 1);
        }
      }
      defaultValue = tokens.slice(start, index + 1).join("");
    }
    index++;
  }
  return {
    name: identifier(tokens[0]),
    dataType,
    nullable: isPrimaryKey ? false : nullable,
    defaultValue,
    isPrimaryKey,
    isForeignKey: false,
  };
}

/** Parses basic MySQL CREATE TABLE statements; defaults retain their SQL spelling. */
export function parseSqlSchema(sql: string): DatabaseSchema {
  const schema: DatabaseSchema = { tables: [], relationships: [] };
  const tokens = tokenize(sql);
  for (let index = 0; index < tokens.length; index++) {
    if (
      tokens[index].toUpperCase() !== "CREATE" ||
      tokens[index + 1]?.toUpperCase() !== "TABLE"
    ) continue;

    index += 2;
    if (
      tokens[index]?.toUpperCase() === "IF" &&
      tokens[index + 1]?.toUpperCase() === "NOT" &&
      tokens[index + 2]?.toUpperCase() === "EXISTS"
    ) index += 3;

    const name = identifier(tokens[index] ?? "");
    if (!name || tokens[index + 1] !== "(") {
      throw new Error("Expected a table name and column definitions.");
    }
    const start = index + 1;
    const end = closingParen(tokens, start);
    const table: DatabaseTable = { name, columns: [], primaryKeys: [] };
    for (let definition of splitDefinitions(tokens.slice(start + 1, end))) {
      if (definition[0].toUpperCase() === "CONSTRAINT") {
        definition = definition.slice(2);
      }
      const upper = definition.map((token) => token.toUpperCase());
      if (upper[0] === "PRIMARY" && upper[1] === "KEY") {
        table.primaryKeys.push(...columnNames(definition, 2));
      } else if (upper[0] === "FOREIGN" && upper[1] === "KEY") {
        const sourceStart = definition.indexOf("(");
        const sourceColumns = columnNames(definition, sourceStart);
        const reference = upper.indexOf("REFERENCES");
        if (reference === -1 || definition[reference + 2] !== "(") {
          throw new Error("FOREIGN KEY requires REFERENCES table(columns).");
        }
        const targetColumns = columnNames(definition, reference + 2);
        if (sourceColumns.length !== targetColumns.length) {
          throw new Error("Foreign key column counts must match.");
        }
        sourceColumns.forEach((sourceColumn, position) => {
          schema.relationships.push({
            sourceTable: name,
            sourceColumn,
            targetTable: identifier(definition[reference + 1]),
            targetColumn: targetColumns[position],
          });
        });
      } else if (!["KEY", "INDEX", "UNIQUE", "CHECK"].includes(upper[0])) {
        if (definition.length < 2) throw new Error("Expected a column data type.");
        const column = parseColumn(definition);
        table.columns.push(column);
        if (column.isPrimaryKey) table.primaryKeys.push(column.name);
      }
    }
    table.primaryKeys = [...new Set(table.primaryKeys)];
    for (const column of table.columns) {
      column.isPrimaryKey = table.primaryKeys.includes(column.name);
      if (column.isPrimaryKey) column.nullable = false;
      column.isForeignKey = schema.relationships.some(
        (relationship) =>
          relationship.sourceTable === name &&
          relationship.sourceColumn === column.name,
      );
    }
    schema.tables.push(table);
    index = end;
  }
  return schema;
}
