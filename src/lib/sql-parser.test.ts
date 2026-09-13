import assert from "node:assert/strict";
import { parseSqlSchema } from "./sql-parser";

// Internal validation: run with Node using the installed TypeScript compiler.
const simple = parseSqlSchema("CREATE TABLE users (id INT, name VARCHAR(100));");
assert.deepEqual(simple, {
  tables: [{
    name: "users",
    columns: [
      { name: "id", dataType: "INT", nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isAutoIncrement: false },
      { name: "name", dataType: "VARCHAR(100)", nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isAutoIncrement: false },
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
const invalidCases: [string, RegExp][] = [
  [`CREATE TABLE customers (
    id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL
    email VARCHAR(255)
  );`, /missing comma/i],
  ["CREATE TABLE customers (name TEXT email VARCHAR(255));", /missing comma/i],
  ["CREATE TABLE customers (id INT DEFAULT 0 email TEXT);", /missing comma/i],
  ["CREATE TABLE customers (id INT", /Unclosed parenthesis/i],
  ["CREATE TABLE (id INT);", /table name/i],
  ["CREATE TABLE c (id INT, FOREIGN (id) REFERENCES p(id));", /FOREIGN KEY/i],
  ["CREATE TABLE c (id INT, FOREIGN KEY id REFERENCES p(id));", /FOREIGN KEY/i],
  ["CREATE TABLE c (id INT, FOREIGN KEY (id) p(id));", /REFERENCES/i],
  ["CREATE TABLE c (id INT, FOREIGN KEY (id) REFERENCES (id));", /REFERENCES/i],
  ["CREATE TABLE c (id INT, FOREIGN KEY (id extra) REFERENCES p(id));", /column list/i],
  ["CREATE TABLE c (id INT, FOREIGN KEY (id) REFERENCES p(id) email TEXT);", /missing comma/i],
  ["CREATE TABLE c (id INT, FOREIGN KEY (id) REFERENCES p(id,other));", /counts must match/i],
  ["CREATE TABLE c (id INT, PRIMARY KEY (id) email TEXT);", /missing comma/i],
  ["CREATE TABLE c (id INT, PRIMARY (id));", /PRIMARY KEY/i],
  ["CREATE TABLE c (id INT,);", /trailing comma/i],
  ["CREATE TABLE c (id INT,, name TEXT);", /Empty definition/i],
  ["CREATE TABLE c ();", /Empty definition/i],
  ["CREATE TABLE c (id);", /data type/i],
  ["CREATE TABLE c (id INT NOT);", /missing comma/i],
  ["CREATE TABLE c (id INT DEFAULT);", /requires a value/i],
  ["CREATE TABLE c (id INT DEFAULT -);", /numeric DEFAULT/i],
  ["This is completely non-SQL input.", /Unexpected SQL outside a CREATE TABLE/i],
];
for (const [sql, message] of invalidCases) {
  assert.throws(() => parseSqlSchema(sql), message, sql);
}

const attributes = parseSqlSchema(`
  CREATE TABLE IF NOT EXISTS child (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parent_id INT NULL,
    label VARCHAR(100) UNIQUE COMMENT 'email VARCHAR(255)',
    updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY fk_parent (parent_id) REFERENCES parent(id) ON DELETE SET NULL ON UPDATE CASCADE
  );
`);
assert.equal(attributes.tables[0].columns.length, 4);
assert.equal(attributes.relationships.length, 1);
assert.equal(attributes.tables[0].columns[3].defaultValue, "CURRENT_TIMESTAMP");
const customersSql = "CREATE TABLE customers (id INT PRIMARY KEY);";
const ordersSql = "CREATE TABLE orders (id INT PRIMARY KEY);";
const unconsumedCases = [
  `${customersSql}\nhello world`,
  `hello world\n${customersSql}`,
  `${customersSql}\ngarbage text\n${ordersSql}`,
  `${customersSql}\nSELECT 1;`,
  `${customersSql})`,
  `${customersSql}\n/* unsupported block comment */`,
];
for (const sql of unconsumedCases) {
  assert.throws(() => parseSqlSchema(sql), /Unexpected SQL outside a CREATE TABLE statement near/i, sql);
}
const cleanMultiple = parseSqlSchema(`${customersSql}\n${ordersSql}`);
assert.deepEqual(cleanMultiple.tables.map((table) => table.name), ["customers", "orders"]);
assert.deepEqual(parseSqlSchema(`
  ; -- customer table
  ${customersSql}

  ; ;
  -- orders table
  ${ordersSql}
  ; -- trailing comment without a newline`), cleanMultiple);
assert.deepEqual(parseSqlSchema(" \n; ; -- comments and separators only\n\t;"), {
  tables: [], relationships: [],
});
assert.equal(parseSqlSchema("CREATE TABLE notes (body TEXT DEFAULT 'hello; -- world');")
  .tables[0].columns[0].defaultValue, "'hello; -- world'");
console.log(`SQL parser validation passed, including ${invalidCases.length + unconsumedCases.length} invalid-input cases.`);

// Dump statements are ignored without interpreting quoted data as SQL.
for (const prefix of [
  "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO'; SET time_zone = '+00:00';",
  "START TRANSACTION;",
  "DROP TABLE IF EXISTS customers;",
  "CREATE DATABASE IF NOT EXISTS demo; USE demo;",
  "/*!40101 SET NAMES utf8mb4 */;",
]) {
  assert.deepEqual(parseSqlSchema(`${prefix}\n${customersSql}`), parseSqlSchema(customersSql));
}
assert.deepEqual(parseSqlSchema(`${customersSql}
  LOCK TABLES customers WRITE;
  INSERT INTO customers VALUES (1, 'hello; -- world'), (2, 'CREATE TABLE fake (id INT);');
  UNLOCK TABLES; COMMIT;
`), parseSqlSchema(customersSql));

const altered = parseSqlSchema(`
  CREATE TABLE customers (id INT, email VARCHAR(255));
  CREATE TABLE orders (id INT, customer_id INT);
  ALTER TABLE customers ADD PRIMARY KEY (id), ADD UNIQUE KEY email_unique (email);
  ALTER TABLE orders ADD PRIMARY KEY (id), ADD KEY customer_id (customer_id);
  ALTER TABLE orders ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id);
`);
assert.deepEqual(altered.tables[0].primaryKeys, ['id']);
assert.equal(altered.tables[0].columns[0].isPrimaryKey, true);
assert.equal(altered.tables[0].columns[0].nullable, false);
assert.equal(altered.tables[1].columns[1].isForeignKey, true);
assert.deepEqual(altered.relationships, [{ sourceTable: 'orders', sourceColumn: 'customer_id', targetTable: 'customers', targetColumn: 'id' }]);
for (const addition of ['UNIQUE (email)', 'UNIQUE KEY (email)', 'INDEX email_idx (email)', 'KEY (email)']) {
  assert.equal(parseSqlSchema(`CREATE TABLE customers (email TEXT); ALTER TABLE customers ADD ${addition};`).tables.length, 1);
}
assert.equal(parseSqlSchema('CREATE TABLE c (id INT); ALTER TABLE c ADD FOREIGN KEY (id) REFERENCES p(id);').relationships.length, 1);

const dump = parseSqlSchema(`
  -- Simplified phpMyAdmin SQL dump
  SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
  START TRANSACTION;
  SET time_zone = '+00:00';
  /*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
  /*!40101 SET NAMES utf8mb4 */;
  CREATE DATABASE IF NOT EXISTS demo;
  USE demo;
  DROP TABLE IF EXISTS customers;
  CREATE TABLE customers (id INT NOT NULL, email VARCHAR(255) DEFAULT NULL)
    ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  CREATE TABLE orders (id INT NOT NULL, customer_id INT NOT NULL, total DECIMAL(10,2) DEFAULT 0)
    ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4;
  INSERT INTO customers (id,email) VALUES (1,'one@example.com');
  INSERT INTO orders VALUES (1,1,12.50);
  ALTER TABLE customers ADD PRIMARY KEY (id), ADD UNIQUE (email);
  ALTER TABLE orders ADD PRIMARY KEY (id), ADD INDEX (customer_id),
    ADD CONSTRAINT fk_orders FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
  COMMIT;
  /*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
`);
assert.equal(dump.tables.length, 2);
assert.equal(dump.tables[1].columns[2].defaultValue, '0');
assert.equal(dump.relationships.length, 1);
assert.ok(dump.tables.every(table => table.columns[0].isPrimaryKey));
for (const sql of [
  'hello world', `${customersSql} SELECT * FROM customers;`,
  `${customersSql} DELETE FROM customers;`,
  '/*!40101 hello world */;',
  `${customersSql} ALTER TABLE customers DROP COLUMN id;`,
  `${customersSql} ALTER TABLE customers ADD PRIMARY KEY (missing);`,
  'ALTER TABLE missing ADD PRIMARY KEY (id);',
  `${customersSql} ALTER TABLE customers ADD FOREIGN KEY (id) customers(id);`,
  `${customersSql} ALTER TABLE customers ADD UNIQUE (id) garbage;`,
  'COMMIT garbage;',
]) assert.throws(() => parseSqlSchema(sql), Error, sql);
console.log('MySQL dump and ALTER TABLE validation passed.');

const autoCreated = parseSqlSchema('CREATE TABLE c (id INT PRIMARY KEY AUTO_INCREMENT, label TEXT);');
assert.equal(autoCreated.tables[0].columns[0].isAutoIncrement, true);
assert.equal(autoCreated.tables[0].columns[1].isAutoIncrement, false);
for (const modify of ['MODIFY', 'MODIFY COLUMN']) {
  const result = parseSqlSchema(`CREATE TABLE c (id INT, label TEXT);
    ALTER TABLE c ${modify} id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=25;
    ALTER TABLE c ${modify} label VARCHAR(100) NOT NULL DEFAULT 'hello, world';
  `).tables[0];
  assert.equal(result.columns[0].dataType, 'INT(11)');
  assert.equal(result.columns[0].nullable, false);
  assert.equal(result.columns[0].isAutoIncrement, true);
  assert.equal(result.columns[1].defaultValue, "'hello, world'");
  assert.equal(result.columns[1].nullable, false);
}
const renamed = parseSqlSchema(`
  CREATE TABLE p (id INT PRIMARY KEY);
  CREATE TABLE c (id INT PRIMARY KEY, parent_id INT, FOREIGN KEY (parent_id) REFERENCES p(id));
  ALTER TABLE p CHANGE COLUMN id parent_key BIGINT NOT NULL AUTO_INCREMENT;
  ALTER TABLE c CHANGE parent_id reference_id BIGINT;
  ALTER TABLE c MODIFY id BIGINT;
`);
assert.deepEqual(renamed.tables[0].primaryKeys, ['parent_key']);
assert.equal(renamed.tables[1].columns[0].isPrimaryKey, true);
assert.equal(renamed.tables[1].columns[0].nullable, false);
assert.equal(renamed.tables[1].columns[1].isForeignKey, true);
assert.equal(renamed.relationships[0].sourceColumn, 'reference_id');
assert.equal(renamed.relationships[0].targetColumn, 'parent_key');
const resetDefinition = parseSqlSchema(`CREATE TABLE c (id INT NOT NULL DEFAULT 1 AUTO_INCREMENT);
  ALTER TABLE c MODIFY id BIGINT;`).tables[0].columns[0];
assert.equal(resetDefinition.nullable, true);
assert.equal(resetDefinition.defaultValue, null);
assert.equal(resetDefinition.isAutoIncrement, false);
assert.equal(parseSqlSchema('CREATE TABLE c (id INT); ALTER TABLE c MODIFY id INT PRIMARY KEY;').tables[0].primaryKeys[0], 'id');
assert.deepEqual(parseSqlSchema(`${customersSql} ALTER TABLE customers AUTO_INCREMENT=25;`), parseSqlSchema(customersSql));
for (const action of ['MODIFY missing INT', 'MODIFY id', 'MODIFY id INT garbage', 'CHANGE id', 'AUTO_INCREMENT=-1', 'AUTO_INCREMENT=25 garbage', 'DROP COLUMN id', 'RENAME TO other', 'ADD COLUMN another INT']) {
  assert.throws(() => parseSqlSchema(`${customersSql} ALTER TABLE customers ${action};`), Error, action);
}
assert.throws(() => parseSqlSchema('CREATE TABLE c (id INT, other INT); ALTER TABLE c CHANGE id other INT;'), /already exists/);
console.log('MODIFY, CHANGE, and AUTO_INCREMENT validation passed.');
