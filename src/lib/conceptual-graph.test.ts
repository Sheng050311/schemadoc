import assert from "node:assert/strict";
import { generateConceptualGraph } from "./conceptual-graph";
import { parseSqlSchema } from "./sql-parser";

function relationshipEdges(sql: string) {
  const graph = generateConceptualGraph(parseSqlSchema(sql));
  const relationship = graph.nodes.filter((node) => node.type === "relationship");
  assert.equal(relationship.length, 1);
  return graph.edges.filter((edge) => edge.id.startsWith(`${relationship[0].id}-`));
}

const parent = "CREATE TABLE parent (id INT PRIMARY KEY);";

let edges = relationshipEdges(`${parent} CREATE TABLE child (pid INT NOT NULL, FOREIGN KEY (pid) REFERENCES parent(id));`);
assert.equal(edges[0].label, undefined);
assert.equal(edges[1].label, "1..1");

edges = relationshipEdges(`${parent} CREATE TABLE child (pid INT, FOREIGN KEY (pid) REFERENCES parent(id));`);
assert.equal(edges[0].label, undefined);
assert.equal(edges[1].label, "0..1");

edges = relationshipEdges(`${parent} CREATE TABLE child (pid INT UNIQUE, FOREIGN KEY (pid) REFERENCES parent(id));`);
assert.equal(edges[0].label, "1");
assert.equal(edges[1].label, "0..1");

edges = relationshipEdges(`${parent} CREATE TABLE child (pid INT PRIMARY KEY, FOREIGN KEY (pid) REFERENCES parent(id));`);
assert.equal(edges[0].label, "1");
assert.equal(edges[1].label, "1..1");

const composite = generateConceptualGraph(parseSqlSchema(`
  CREATE TABLE parent (a INT, b INT, PRIMARY KEY (a, b));
  CREATE TABLE child (x INT NOT NULL, y INT, FOREIGN KEY (x, y) REFERENCES parent(a, b));
`));
assert.equal(composite.nodes.filter((node) => node.type === "relationship").length, 1);
assert.equal(composite.edges.find((edge) => edge.id === "relationship-0-target")?.label, "0..1");
assert.equal(composite.edges.find((edge) => edge.id === "relationship-0-source")?.label, undefined);

const suggested = generateConceptualGraph(parseSqlSchema(`${parent} CREATE TABLE child (pid INT);`), [{
  sourceTable: "child", sourceColumn: "pid", targetTable: "parent", targetColumn: "id", confidence: "high", reason: "test",
}], "all");
assert.equal(suggested.edges.find((edge) => edge.id === "relationship-0-source")?.label, undefined);
assert.equal(suggested.edges.find((edge) => edge.id === "relationship-0-target")?.label, undefined);

console.log("Conceptual ERD cardinality validation passed.");
