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
    sql.match(/'(?:\\.|''|[^'\\])*'|"(?:\\.|""|[^"\\])*"|`(?:``|[^`])*`|--[^\r\n]*|\/\*![\s\S]*?\*\/|[\w$]+|[^\s]/g) ?? []
  ).filter((token) => !token.startsWith("--"));
}

function statementEnd(tokens: string[], start: number): number {
  const end = tokens.indexOf(";", start);
  return end === -1 ? tokens.length : end;
}

function isIgnoredDumpStatement(tokens: string[]): boolean {
  const text = tokens.join(" ");
  // This allowlist classifies dump statements, rather than validating their
  // data or session settings. Quoted semicolons remain inside single tokens.
  return /^SET\s+\S/i.test(text) ||
    /^START TRANSACTION$/i.test(text) || /^COMMIT$/i.test(text) ||
    /^INSERT INTO\s+\S/i.test(text) || /^LOCK TABLES\s+\S/i.test(text) ||
    /^UNLOCK TABLES$/i.test(text) || /^DROP TABLE IF EXISTS\s+\S/i.test(text) ||
    /^USE (?:`(?:``|[^`])+`|[\w$]+)$/i.test(text) ||
    /^CREATE DATABASE\s+\S/i.test(text);
}

function applyAlter(schema: DatabaseSchema, tokens: string[]) {
  if (tokens[1]?.toUpperCase() !== "TABLE" || !isIdentifier(tokens[2])) {
    throw new Error("Expected ALTER TABLE table_name ADD constraint.");
  }
  const table = schema.tables.find((entry) => entry.name === identifier(tokens[2]));
  if (!table) throw new Error(`ALTER TABLE refers to unknown table "${identifier(tokens[2])}".`);
  for (const action of splitDefinitions(tokens.slice(3))) {
    const operation = action[0]?.toUpperCase();
    if (operation === "AUTO_INCREMENT") {
      const valueIndex = action[1] === "=" ? 2 : 1;
      if (action.length !== valueIndex + 1 || !/^\d+$/.test(action[valueIndex] ?? "")) {
        throw new Error("Expected AUTO_INCREMENT followed by a non-negative integer counter.");
      }
      continue;
    }
    if (operation === "MODIFY" || operation === "CHANGE") {
      let start = action[1]?.toUpperCase() === "COLUMN" ? 2 : 1;
      if (!isIdentifier(action[start])) throw new Error(`Expected a column name after ${operation}.`);
      const oldName = identifier(action[start]);
      const columnIndex = table.columns.findIndex((column) => column.name === oldName);
      if (columnIndex === -1) throw new Error(`Unknown column "${oldName}" in table "${table.name}".`);
      if (operation === "CHANGE") start++;
      const replacement = parseColumn(action.slice(start));
      const previous = table.columns[columnIndex];
      if (table.columns.some((column, index) => index !== columnIndex && column.name === replacement.name)) {
        throw new Error(`Column "${replacement.name}" already exists in table "${table.name}".`);
      }
      // MODIFY/CHANGE replace the definition, but do not drop existing keys.
      replacement.isPrimaryKey ||= previous.isPrimaryKey;
      replacement.isForeignKey = previous.isForeignKey;
      if (replacement.isPrimaryKey) replacement.nullable = false;
      table.columns[columnIndex] = replacement;
      table.primaryKeys = table.primaryKeys.map((name) => name === oldName ? replacement.name : name);
      if (replacement.isPrimaryKey && !table.primaryKeys.includes(replacement.name)) table.primaryKeys.push(replacement.name);
      for (const relationship of schema.relationships) {
        if (relationship.sourceTable === table.name && relationship.sourceColumn === oldName) relationship.sourceColumn = replacement.name;
        if (relationship.targetTable === table.name && relationship.targetColumn === oldName) relationship.targetColumn = replacement.name;
      }
      continue;
    }
    if (operation !== "ADD") throw new Error(`Unsupported ALTER TABLE action "${operation}". Supported actions: ADD keys, MODIFY, CHANGE, and AUTO_INCREMENT.`);
    const definition = action.slice(1);
    const kind = definition[0]?.toUpperCase();
    if (["UNIQUE", "KEY", "INDEX"].includes(kind)) {
      let start = 1;
      if (kind === "UNIQUE" && ["KEY", "INDEX"].includes(definition[start]?.toUpperCase())) start++;
      if (isIdentifier(definition[start])) start++;
      const names = columnNames(definition, start);
      if (closingParen(definition, start) !== definition.length - 1) unexpected(definition[closingParen(definition, start) + 1]);
      for (const name of names) {
        if (!table.columns.some((column) => column.name === name)) throw new Error(`Unknown index column "${name}" in table "${table.name}".`);
      }
      // DatabaseSchema has no unique/index metadata yet.
      continue;
    }
    if (!["PRIMARY", "FOREIGN", "CONSTRAINT"].includes(kind) ||
      (kind === "CONSTRAINT" && definition[2]?.toUpperCase() !== "FOREIGN")) {
      throw new Error("Unsupported ALTER TABLE ADD definition.");
    }
    // Reuse CREATE TABLE's strict key validation rather than a second grammar.
    const parsed = parseSqlSchema(`CREATE TABLE ${tokens[2]} (${definition.join(" ")});`);
    const keys = parsed.tables[0].primaryKeys;
    const sourceColumns = parsed.relationships.map((relationship) => relationship.sourceColumn);
    for (const name of [...keys, ...sourceColumns]) {
      if (!table.columns.some((column) => column.name === name)) throw new Error(`Unknown key column "${name}" in table "${table.name}".`);
    }
    table.primaryKeys = [...new Set([...table.primaryKeys, ...keys])];
    for (const column of table.columns) {
      if (keys.includes(column.name)) { column.isPrimaryKey = true; column.nullable = false; }
      if (sourceColumns.includes(column.name)) column.isForeignKey = true;
    }
    schema.relationships.push(...parsed.relationships);
  }
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
  let isAutoIncrement = false;
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
      if (keyword === "AUTO_INCREMENT") isAutoIncrement = true;
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
    isAutoIncrement,
  };
}

/** Extracts supported CREATE/ALTER schema definitions from MySQL dumps. */
export function parseSqlSchema(sql: string): DatabaseSchema {
  const schema: DatabaseSchema = { tables: [], relationships: [] };
  const tokens = tokenize(sql);
  for (let index = 0; index < tokens.length; index++) {
    // Every non-comment token must belong to a recognized statement or separator.
    if (tokens[index] === ";") continue;
    if (tokens[index].startsWith("/*!")) {
      const body = tokenize(tokens[index].slice(3, -2).replace(/^\d+\s*/, ""));
      if (!body.length || isIgnoredDumpStatement(body)) continue;
      throw new Error("Unsupported SQL in MySQL version comment. Only dump session/data statements may be ignored.");
    }
    if (tokens[index].toUpperCase() === "ALTER") {
      const end = statementEnd(tokens, index);
      applyAlter(schema, tokens.slice(index, end));
      index = end - 1;
      continue;
    }
    const dumpEnd = statementEnd(tokens, index);
    if (isIgnoredDumpStatement(tokens.slice(index, dumpEnd))) {
      index = dumpEnd - 1;
      continue;
    }
    if (
      tokens[index].toUpperCase() !== "CREATE" ||
      tokens[index + 1]?.toUpperCase() !== "TABLE"
    ) {
      throw new Error(`Unexpected SQL outside a CREATE TABLE statement near "${tokens[index]}". Expected CREATE TABLE, supported ALTER TABLE, or a recognized dump statement.`);
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
    // Common phpMyAdmin table options are storage metadata, not columns.
    while (index + 1 < tokens.length) {
      let option = index + 1;
      if (tokens[option].toUpperCase() === "DEFAULT") option++;
      if (tokens[option]?.toUpperCase() === "CHARACTER" && tokens[option + 1]?.toUpperCase() === "SET") option++;
      else if (!["ENGINE", "CHARSET", "COLLATE", "AUTO_INCREMENT"].includes(tokens[option]?.toUpperCase())) break;
      option++;
      if (tokens[option] === "=") option++;
      if (!/^[\w$]+$/.test(tokens[option] ?? "")) throw new Error("Expected a value for CREATE TABLE storage option.");
      index = option;
    }
  }
  return schema;
}
