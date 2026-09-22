import assert from 'node:assert/strict';
import { generateMarkdownDocumentation } from './documentation-generator';
import { parseSqlSchema } from './sql-parser';

const schema = parseSqlSchema(`CREATE TABLE customers (id INT PRIMARY KEY AUTO_INCREMENT);
CREATE TABLE orders (id INT PRIMARY KEY, customer_id INT NOT NULL, total DECIMAL(10,2) DEFAULT 0,
FOREIGN KEY (customer_id) REFERENCES customers(id));`);
const markdown = generateMarkdownDocumentation(schema);
assert.ok(markdown.startsWith('# Database Documentation\n'));
assert.ok(markdown.includes('- Tables: 2\n- Columns: 4\n- Relationships: 1'));
assert.ok(markdown.includes('| id | INT | PK, NOT NULL, AUTO_INCREMENT | — |'));
assert.ok(markdown.includes('| total | DECIMAL\\(10,2\\) | — | 0 |'));
assert.ok(markdown.includes('orders.customer_id'));
assert.ok(markdown.includes('customers.id'));
assert.ok(markdown.includes('FK, NOT NULL'));
const empty = generateMarkdownDocumentation({ tables: [], relationships: [], foreignKeys: [] });
assert.ok(empty.includes('No defined foreign-key relationships were found.'));
schema.tables[0].columns[0].defaultValue = "'a|b\n<script>`'";
const escaped = generateMarkdownDocumentation(schema);
assert.ok(escaped.includes('a\\|b<br>&lt;script&gt;\\`'));
assert.equal(schema.tables[0].columns[0].defaultValue, "'a|b\n<script>`'");
console.log('Markdown generator validation passed.');
