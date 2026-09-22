import assert from "node:assert/strict";
import { generateMermaidErd } from "./erd-generator";
import { parseSqlSchema } from "./sql-parser";

function relationshipLines(sql: string) {
  return generateMermaidErd(parseSqlSchema(sql)).split("\n").filter((line) => line.includes(' : "has"'));
}

const parent = "CREATE TABLE parent (id INT PRIMARY KEY);";

assert.deepEqual(
  relationshipLines(`${parent} CREATE TABLE child (parent_id INT, FOREIGN KEY (parent_id) REFERENCES parent(id));`),
  ['  parent o|--o{ child : "has"'],
);
assert.deepEqual(
  relationshipLines(`${parent} CREATE TABLE child (parent_id INT NOT NULL, FOREIGN KEY (parent_id) REFERENCES parent(id));`),
  ['  parent ||--o{ child : "has"'],
);
assert.deepEqual(
  relationshipLines(`${parent} CREATE TABLE child (parent_id INT PRIMARY KEY, FOREIGN KEY (parent_id) REFERENCES parent(id));`),
  ['  parent ||--o| child : "has"'],
);

const composite = relationshipLines(`
  CREATE TABLE parent (a INT, b INT, PRIMARY KEY (a, b));
  CREATE TABLE child (x INT NOT NULL, y INT, FOREIGN KEY (x, y) REFERENCES parent(a, b));
`);
assert.deepEqual(composite, ['  parent o|--o{ child : "has"']);
assert.equal(composite.length, 1);

assert.throws(
  () => generateMermaidErd(parseSqlSchema("CREATE TABLE child (parent_id INT, FOREIGN KEY (parent_id) REFERENCES missing_parent(id));")),
  /missing from the schema/,
);

console.log("Technical Mermaid ERD validation passed.");
