import assert from "node:assert/strict";
import { parseSqlSchema } from "./sql-parser";

// Internal validation: run with Node using the installed TypeScript compiler.
const simple = parseSqlSchema("CREATE TABLE users (id INT, name VARCHAR(100));");
assert.deepEqual(simple, {
  tables: [{
    name: "users",
    columns: [
      { name: "id", dataType: "INT", nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: "name", dataType: "VARCHAR(100)", nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
    ],
    primaryKeys: [],
  }],
  relationships: [],
});

const multiple = parseSqlSchema(`
  -- First table
  CREATE TABLE users (id BIGINT);

  CREATE TABLE events (created DATE, updated DATETIME, details TEXT, amount DECIMAL(10, 2));
`);
assert.deepEqual(multiple.tables.map((table) => table.name), ["users", "events"]);
assert.deepEqual(multiple.tables[1].columns.map((column) => column.dataType),
  ["DATE", "DATETIME", "TEXT", "DECIMAL(10,2)"]);

const inline = parseSqlSchema("CREATE TABLE users (id INT PRIMARY KEY);").tables[0];
assert.deepEqual(inline.primaryKeys, ["id"]);
assert.equal(inline.columns[0].isPrimaryKey, true);
assert.equal(inline.columns[0].nullable, false);

const tableKey = parseSqlSchema(`
  CREATE TABLE memberships (user_id INT, team_id INT, PRIMARY KEY (user_id, team_id));
`).tables[0];
assert.deepEqual(tableKey.primaryKeys, ["user_id", "team_id"]);
assert.ok(tableKey.columns.every((column) => column.isPrimaryKey && !column.nullable));

const foreign = parseSqlSchema(`
  CREATE TABLE users (id INT PRIMARY KEY);
  CREATE TABLE posts (
    id INT PRIMARY KEY,
    user_id INT,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
assert.deepEqual(foreign.relationships, [{
  sourceTable: "posts", sourceColumn: "user_id", targetTable: "users", targetColumn: "id",
}]);
assert.equal(foreign.tables[1].columns[1].isForeignKey, true);
assert.equal(foreign.tables[1].columns[0].isForeignKey, false);

const defaults = parseSqlSchema(`
  CREATE TABLE settings (
    label VARCHAR(100) NOT NULL DEFAULT 'hello, -- world',
    amount DECIMAL(10,2) DEFAULT -12.50,
    created DATETIME DEFAULT CURRENT_TIMESTAMP(),
    optional TEXT DEFAULT NULL,
    quote TEXT DEFAULT 'it''s fine',
    status TEXT DEFAULT 'PRIMARY KEY NOT NULL',
    enabled INT NOT NULL DEFAULT 1 -- trailing comment
  );
`).tables[0].columns;
assert.deepEqual(defaults.map((column) => column.defaultValue),
  ["'hello, -- world'", "-12.50", "CURRENT_TIMESTAMP()", "NULL", "'it''s fine'", "'PRIMARY KEY NOT NULL'", "1"]);
assert.deepEqual(defaults.map((column) => column.nullable),
  [false, true, true, true, true, true, false]);
assert.equal(defaults[5].isPrimaryKey, false);

const composite = parseSqlSchema(
  "create table `child` (`a` INT, b INT, foreign key (a,b) references `parent`(`x`,y));",
);
assert.equal(composite.relationships.length, 2);
assert.ok(composite.tables[0].columns.every((column) => column.isForeignKey));
assert.deepEqual(parseSqlSchema("-- empty\n"), { tables: [], relationships: [] });
assert.throws(() => parseSqlSchema("CREATE TABLE broken (id INT"), /Unclosed/);
console.log("SQL parser validation passed.");
