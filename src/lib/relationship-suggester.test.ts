import assert from "node:assert/strict";
import { parseSqlSchema } from "./sql-parser";
import { suggestRelationships } from "./relationship-suggester";

const exact = parseSqlSchema(`
  CREATE TABLE tblorder (OrderID INT PRIMARY KEY, CustomerID INT);
  CREATE TABLE tblcustomer (customerid INT PRIMARY KEY);
`);
const before = JSON.stringify(exact);
const high = suggestRelationships(exact);
assert.equal(high.length, 1);
assert.deepEqual({ ...high[0], reason: undefined }, {
  sourceTable: "tblorder", sourceColumn: "CustomerID", targetTable: "tblcustomer",
  targetColumn: "customerid", confidence: "high", reason: undefined,
});
assert.ok(high[0].reason);
assert.equal(JSON.stringify(exact), before);
assert.deepEqual(suggestRelationships(exact), high);

for (const table of ["customer", "tblcustomer", "CUSTOMERS"]) {
  for (const column of ["CustomerID", "customer_id"]) {
    const schema = parseSqlSchema(`CREATE TABLE orders (${column} INT); CREATE TABLE ${table} (id INT PRIMARY KEY);`);
    const result = suggestRelationships(schema);
    assert.equal(result.length, 1);
    assert.equal(result[0].confidence, "medium");
    assert.equal(result[0].targetTable, table);
  }
}

const duplicate = structuredClone(exact);
duplicate.tables.push(structuredClone(duplicate.tables[1]));
assert.equal(suggestRelationships(duplicate).length, 1);
exact.relationships.push({ sourceTable: "TBLORDER", sourceColumn: "CUSTOMERID", targetTable: "TBLCUSTOMER", targetColumn: "CUSTOMERID" });
assert.deepEqual(suggestRelationships(exact), []);

for (const sql of [
  "CREATE TABLE customers (id INT PRIMARY KEY, CustomerID INT);",
  "CREATE TABLE orders (id INT); CREATE TABLE customers (id INT PRIMARY KEY);",
  "CREATE TABLE orders (CustomerID INT PRIMARY KEY); CREATE TABLE customers (CustomerID INT PRIMARY KEY);",
  "CREATE TABLE orders (CustomerID INT); CREATE TABLE customer_archive (id INT PRIMARY KEY);",
  "CREATE TABLE orders (CustomerID INT); CREATE TABLE customers (id INT);",
  "CREATE TABLE orders (CustomerID INT, FOREIGN KEY (CustomerID) REFERENCES customers(id)); CREATE TABLE customers (id INT PRIMARY KEY);",
]) assert.deepEqual(suggestRelationships(parseSqlSchema(sql)), [], sql);

console.log("Relationship suggestion validation passed.");

for (const [sourceType, targetType, confidence] of [
  ['INT', 'INT(11)', 'high'], ['BIGINT', 'BIGINT', 'high'],
  ['VARCHAR(20)', 'VARCHAR(20)', 'high'], ['VARCHAR(20)', 'VARCHAR(10)', 'medium'],
  ['CHAR(20)', 'VARCHAR(20)', 'medium'], ['INT', 'TEXT', 'medium'],
  ['INT', 'BIGINT', 'medium'],
]) {
  const result = suggestRelationships(parseSqlSchema(`CREATE TABLE a (CustomerID ${sourceType}); CREATE TABLE b (customerid ${targetType} PRIMARY KEY);`));
  assert.equal(result.length, 1);
  assert.equal(result[0].confidence, confidence);
  if (confidence === 'medium') assert.match(result[0].reason, /Data types differ/);
}
const competing = parseSqlSchema('CREATE TABLE source (InvoiceNo INT); CREATE TABLE received (InvoiceNo INT PRIMARY KEY); CREATE TABLE sales (InvoiceNo INT PRIMARY KEY);');
const competingResults = suggestRelationships(competing);
assert.equal(competingResults.length, 2);
assert.ok(competingResults.every(result => result.confidence === 'medium' && result.reason.includes('2 candidate target tables')));
competing.relationships.push({ sourceTable: 'source', sourceColumn: 'InvoiceNo', targetTable: 'received', targetColumn: 'InvoiceNo' });
assert.equal(suggestRelationships(competing).length, 1);
assert.equal(suggestRelationships(competing)[0].confidence, 'high');
assert.equal(suggestRelationships(duplicate)[0].confidence, 'high');
const mixed = suggestRelationships(parseSqlSchema('CREATE TABLE orders (CustomerID INT); CREATE TABLE account (CustomerID INT PRIMARY KEY); CREATE TABLE customers (id INT PRIMARY KEY);'));
assert.equal(mixed.length, 2);
assert.ok(mixed.every(result => result.confidence === 'medium'));
console.log('Confidence calibration validation passed.');
