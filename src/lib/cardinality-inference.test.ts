import assert from "node:assert/strict";
import { parseSqlSchema } from "./sql-parser";
import { inferRelationshipCardinality } from "./cardinality-inference";

function infer(sql: string) {
  const schema = parseSqlSchema(sql);
  const before = JSON.stringify(schema);
  const result = inferRelationshipCardinality(schema, schema.foreignKeys[0]);
  assert.equal(JSON.stringify(schema), before);
  assert.equal(result.targetMin, "unknown");
  return result;
}

for (const [definition, min, max] of [
  ["pid INT", 0, "unknown"],
  ["pid INT NOT NULL", 1, "unknown"],
  ["pid INT UNIQUE", 0, 1],
  ["pid INT PRIMARY KEY", 1, 1],
] as const) {
  const result = infer(`CREATE TABLE p (id INT PRIMARY KEY); CREATE TABLE c (${definition}, FOREIGN KEY (pid) REFERENCES p(id));`);
  assert.equal(result.sourceMin, min);
  assert.equal(result.sourceMax, 1);
  assert.equal(result.targetMax, max);
}
for (const nullable of [true, false]) {
  const result = infer(`CREATE TABLE p (a INT, b INT, PRIMARY KEY (a,b));
    CREATE TABLE c (x INT NOT NULL, y INT ${nullable ? "" : "NOT NULL"}, UNIQUE KEY pair (y,x), FOREIGN KEY (x,y) REFERENCES p(a,b));`);
  assert.equal(result.sourceMin, nullable ? 0 : 1);
  assert.equal(result.targetMax, 1);
  assert.equal(result.foreignKey.sourceColumns.length, 2);
}
const partial = infer(`CREATE TABLE p (id INT PRIMARY KEY); CREATE TABLE c (pid INT, extra INT, PRIMARY KEY (pid,extra), FOREIGN KEY (pid) REFERENCES p(id));`);
assert.equal(partial.targetMax, "unknown");
const composite = infer(`CREATE TABLE p (a INT, b INT, UNIQUE (a,b)); CREATE TABLE c (x INT, y INT, FOREIGN KEY (x,y) REFERENCES p(a,b));`);
assert.equal(composite.targetMax, "unknown");

const base = parseSqlSchema("CREATE TABLE p (id INT PRIMARY KEY); CREATE TABLE c (pid INT, FOREIGN KEY (pid) REFERENCES p(id));");
for (const change of [
  (schema: typeof base) => { schema.tables.shift(); },
  (schema: typeof base) => { schema.tables.pop(); },
  (schema: typeof base) => { schema.tables[0].columns = []; },
  (schema: typeof base) => { schema.tables[1].columns = []; },
  (schema: typeof base) => { schema.tables[0].primaryKeys = []; },
  (schema: typeof base) => { schema.foreignKeys[0].sourceColumns = []; },
]) {
  const schema = structuredClone(base);
  change(schema);
  const result = inferRelationshipCardinality(schema, schema.foreignKeys[0]);
  assert.deepEqual([result.sourceMin, result.sourceMax, result.targetMin, result.targetMax], ["unknown", "unknown", "unknown", "unknown"]);
  assert.ok(result.reason.length);
}
console.log("Cardinality inference validation passed.");
