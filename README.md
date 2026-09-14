# SchemaDoc

Turn supported MySQL schemas and phpMyAdmin dumps into database documentation and Mermaid entity relationship diagrams (ERDs).

## Demo

Live Demo: [SchemaDoc on Vercel](https://schemadoc-iota.vercel.app/)

## Features

- Paste SQL, load a built-in example, or select a local `.sql` file up to 5 MB.
- Extract tables and columns from supported MySQL schemas and dump statements.
- Report parsing errors, including missing column separators and unknown statements.
- Review table, column, and relationship counts, data types, nullability, defaults, and PK/FK/AUTO_INCREMENT badges.
- View defined foreign-key relationships and a scrollable Mermaid ERD.
- Copy Markdown documentation with clipboard feedback or download `schemadoc-documentation.md`.
- Process SQL locally in the browser.

## How It Works

1. Paste SQL or upload a `.sql` file. Use **Load Example** to try a sample schema.
2. Review the SQL, then select **Generate Documentation**. Uploading a file does not generate documentation automatically.
3. Review the schema overview, tables, columns, keys, and defined relationships.
4. View the **Entity Relationship Diagram**.
5. Select **Copy Documentation** or **Export Markdown**.

## Privacy

SQL text and files are processed locally in your browser. Files are read with browser APIs, and parsing, ERD generation, clipboard copying, and Markdown downloads happen on the client. SchemaDoc does not upload SQL dumps to a backend or require a database connection.

## Supported SQL

Schema extraction currently includes:

- Multiple `CREATE TABLE` statements, optional `IF NOT EXISTS`, backtick identifiers, and `--` line comments.
- Column types such as `INT`, `BIGINT`, `VARCHAR(n)`, `TEXT`, `DATE`, `DATETIME`, and `DECIMAL(p,s)`.
- Inline and table-level primary keys, including composite primary keys.
- Named and unnamed `FOREIGN KEY (...) REFERENCES table (...)` constraints, including composite keys represented as individual column relationships.
- `NOT NULL`, `DEFAULT` values, and column-level `AUTO_INCREMENT`. Defaults retain their SQL spelling.
- `ALTER TABLE ADD PRIMARY KEY` and `ADD [CONSTRAINT name] FOREIGN KEY`.
- `ALTER TABLE MODIFY [COLUMN]` and `CHANGE [COLUMN]` definitions. Existing keys are preserved, and renames update recorded relationships.
- Comma-separated supported ALTER operations, including table-level `AUTO_INCREMENT=n` counters.

The following are accepted without adding documentation metadata:

- Dump statements: `SET`, `START TRANSACTION`, `COMMIT`, `INSERT INTO`, `LOCK TABLES`, `UNLOCK TABLES`, `DROP TABLE IF EXISTS`, `USE`, and `CREATE DATABASE`. They are skipped, not executed.
- Empty MySQL version comments (`/*! ... */`) or those containing recognized non-schema dump statements.
- `ALTER TABLE ADD UNIQUE [KEY/INDEX]`, `ADD KEY`, and `ADD INDEX` with supported column lists. Unique and index metadata is not stored.
- Table-level `KEY`, `INDEX`, `UNIQUE`, and `CHECK` definitions in `CREATE TABLE`.
- Common storage options: `ENGINE`, `CHARSET`/`CHARACTER SET`, `COLLATE`, and table-level `AUTO_INCREMENT` counters.
- Column modifiers such as `UNSIGNED`, `SIGNED`, `ZEROFILL`, `UNIQUE`, `COMMENT`, and supported `ON UPDATE` expressions; foreign-key `ON DELETE`/`ON UPDATE` actions are recognized but not documented.

## Limitations

- This is a schema extractor, not a complete MySQL parser or validator. Skipped statements and some accepted definitions are not fully validated. Not every phpMyAdmin dump will parse.
- Unsupported ALTER operations, including `ADD COLUMN`, `DROP COLUMN`, and `RENAME TO`, produce errors. ALTER operations require the table to have already been defined.
- General block comments, schema-qualified table names, and statements such as `SELECT` and `DELETE` are not supported.
- Relationships come only from explicit foreign keys; they are not inferred from column names. ERDs use a fixed one-to-many convention rather than deriving exact cardinality.
- ERDs show base data types without length or precision, encode unusual identifiers, and require referenced tables to be present. Markdown exports contain documentation, not the diagram.
- Uploaded files are limited to 5 MB. Clipboard access depends on browser permissions; Markdown download is available as an alternative.

## Tech Stack

- Next.js 16 with the App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Mermaid 12
- Vercel deployment

## Local Development

Use Node.js 20.9 or newer and npm. Clone or download the repository, then run these commands from the project directory:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To run lint and TypeScript checks:

```bash
npm run lint
npx tsc --noEmit --incremental false
```

## Production Build

```bash
npm run build
npm run start
```

## Project Status

**Beta / MVP.** SchemaDoc is under active development, with ongoing improvements to SQL compatibility and documentation.

## Future Ideas

These ideas are not implemented:

- Suggested relationships
- PostgreSQL support
- PDF/DOCX export
- Schema comparison

## License

Licensing information has not yet been added.
