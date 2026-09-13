import type {
  DatabaseColumn,
  DatabaseSchema,
  DatabaseTable,
} from "../types/schema";

const identifier = (token: string) =>
  token.startsWith("`") ? token.slice(1, -1).replaceAll("``", "`") : token;

const isIdentifier = (token: string | undefined) =>
  token !== undefined && /^(?:[a-zA-Z_$][\w$]*|`(?:``|[^`])+`)$/.test(token);

function unexpected(token: string | undefined): never {
  throw new Error(`Unexpected token "${token ?? "end of definition"}". Check for a missing comma between column definitions.`);
}

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
      if (!current.length) throw new Error("Empty definition between commas.");
      definitions.push(current);
      current = [];
      continue;
    }
    if (token === "(") depth++;
    if (token === ")") depth--;
    current.push(token);
  }
  if (!current.length) throw new Error("Empty definition or trailing comma in CREATE TABLE body.");
  definitions.push(current);
  return definitions;
}

function closingParen(tokens: string[], start: number): number {
  if (start < 0 || tokens[start] !== "(") {
    throw new Error("Expected an opening parenthesis for a column list or type.");
  }
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    if (tokens[index] === "(") depth++;
    if (tokens[index] === ")" && --depth === 0) return index;
  }
  throw new Error("Unclosed parenthesis in CREATE TABLE statement.");
}

function columnNames(tokens: string[], start: number): string[] {
  const end = closingParen(tokens, start);
  return splitDefinitions(tokens.slice(start + 1, end)).map((part) => {
    if (part.length !== 1 || !isIdentifier(part[0])) {
      throw new Error("Invalid key column list. Separate column names with commas.");
    }
    return identifier(part[0]);
  });
}

function parseColumn(tokens: string[]): DatabaseColumn {
  if (!isIdentifier(tokens[0]) || !/^[a-zA-Z]+$/.test(tokens[1] ?? "")) {
    throw new Error("Malformed column definition: expected a column name and data type.");
  }
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
    if (keyword === "NOT" && next === "NULL") {
      nullable = false;
      index += 2;
      continue;
    }
    if (keyword === "PRIMARY" && next === "KEY") {
      isPrimaryKey = true;
      index += 2;
      continue;
    }
    if (["NULL", "AUTO_INCREMENT", "UNSIGNED", "SIGNED", "ZEROFILL"].includes(keyword)) {
      index++;
      continue;
    }
    if (keyword === "UNIQUE") {
      index += next === "KEY" ? 2 : 1;
      continue;
    }
    if (keyword === "COMMENT" && /^['"]/.test(tokens[index + 1] ?? "")) {
      index += 2;
      continue;
    }
    if (keyword === "DEFAULT" || (keyword === "ON" && next === "UPDATE")) {
      const isDefault = keyword === "DEFAULT";
      if (!isDefault) index++;
      const start = ++index;
      if (index >= tokens.length) throw new Error("DEFAULT requires a value.");
      if (tokens[index] === "+" || tokens[index] === "-") {
        index++;
        if (!/^\d+$/.test(tokens[index] ?? "")) throw new Error("Expected a numeric DEFAULT value after sign.");
      }
      if (tokens[index] === "(") {
        index = closingParen(tokens, index);
      } else {
        // Decimal literals and function defaults such as CURRENT_TIMESTAMP().
        if (!/^(?:\d+|NULL|TRUE|FALSE|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|LOCALTIME|LOCALTIMESTAMP|NOW)$/i.test(tokens[index]) && !/^(['"])(?:[\s\S]*)\1$/.test(tokens[index])) {
          throw new Error("Invalid DEFAULT value. Quote string values and check for missing commas.");
        }
        if (tokens[index + 1] === ".") {
          index += 2;
          if (!/^\d+$/.test(tokens[index] ?? "")) throw new Error("Invalid numeric DEFAULT value.");
        }
        if (tokens[index + 1] === "(") {
          index = closingParen(tokens, index + 1);
        }
      }
      if (isDefault) defaultValue = tokens.slice(start, index + 1).join("");
      index++;
      continue;
    }
    unexpected(tokens[index]);
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
    // Whitespace and line comments are removed by tokenize. Only separators
    // may be skipped here; every other token must begin a supported statement.
    if (tokens[index] === ";") continue;
    if (
      tokens[index].toUpperCase() !== "CREATE" ||
      tokens[index + 1]?.toUpperCase() !== "TABLE"
    ) {
      throw new Error(`Unexpected SQL outside a CREATE TABLE statement near "${tokens[index]}". Expected CREATE TABLE or a semicolon.`);
    }

    index += 2;
    if (
      tokens[index]?.toUpperCase() === "IF" &&
      tokens[index + 1]?.toUpperCase() === "NOT" &&
      tokens[index + 2]?.toUpperCase() === "EXISTS"
    ) index += 3;

    const name = identifier(tokens[index] ?? "");
    if (!isIdentifier(tokens[index]) || tokens[index + 1] !== "(") {
      throw new Error("Expected a table name and column definitions.");
    }
    const start = index + 1;
    const end = closingParen(tokens, start);
    const table: DatabaseTable = { name, columns: [], primaryKeys: [] };
    for (let definition of splitDefinitions(tokens.slice(start + 1, end))) {
      if (definition[0].toUpperCase() === "CONSTRAINT") {
        if (!isIdentifier(definition[1]) || !["PRIMARY", "FOREIGN", "UNIQUE", "CHECK"].includes(definition[2]?.toUpperCase())) {
          throw new Error("Malformed CONSTRAINT definition.");
        }
        definition = definition.slice(2);
      }
      const upper = definition.map((token) => token.toUpperCase());
      if (upper[0] === "PRIMARY") {
        if (upper[1] !== "KEY" || definition[2] !== "(") throw new Error("Expected PRIMARY KEY (columns).");
        table.primaryKeys.push(...columnNames(definition, 2));
        if (closingParen(definition, 2) !== definition.length - 1) unexpected(definition[closingParen(definition, 2) + 1]);
      } else if (upper[0] === "FOREIGN") {
        const sourceStart = definition.indexOf("(");
        if (upper[1] !== "KEY" || !(sourceStart === 2 || (sourceStart === 3 && isIdentifier(definition[2])))) {
          throw new Error("Malformed FOREIGN KEY: expected FOREIGN KEY (columns) REFERENCES table(columns).");
        }
        const sourceColumns = columnNames(definition, sourceStart);
        const reference = closingParen(definition, sourceStart) + 1;
        if (upper[reference] !== "REFERENCES" || !isIdentifier(definition[reference + 1]) || definition[reference + 2] !== "(") {
          throw new Error("FOREIGN KEY requires REFERENCES table(columns).");
        }
        const targetColumns = columnNames(definition, reference + 2);
        let tail = closingParen(definition, reference + 2) + 1;
        while (tail < definition.length) {
          if (upper[tail] !== "ON" || !["DELETE", "UPDATE"].includes(upper[tail + 1])) unexpected(definition[tail]);
          tail += 2;
          if (["CASCADE", "RESTRICT"].includes(upper[tail])) tail++;
          else if ((upper[tail] === "SET" && ["NULL", "DEFAULT"].includes(upper[tail + 1])) || (upper[tail] === "NO" && upper[tail + 1] === "ACTION")) tail += 2;
          else throw new Error("Malformed FOREIGN KEY referential action.");
        }
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
