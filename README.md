# SchemaDoc

Turn supported MySQL schemas and phpMyAdmin dumps into browser-local documentation and ERDs.

## Demo

Live Demo: [SchemaDoc on Vercel](https://schemadoc-iota.vercel.app/)

## Features

- Paste SQL, load a built-in example, or select a local `.sql` file up to 5 MB.
- Extract tables and columns from supported MySQL schemas and dump statements.
- Report parsing errors, including missing column separators and unknown statements.
- Review tables, columns, nullability, defaults, PK/FK/AUTO_INCREMENT badges, and table-level UNIQUE constraints, including composite UNIQUE keys.
- Review defined foreign keys and clearly labeled High- and Medium-confidence relationship suggestions.
- View a Mermaid-based Technical ERD for defined schema relationships.
- View a React Flow Conceptual ERD with entities, attributes, relationship diamonds, table search, Select All/Clear, and a Show Attributes toggle.
- In the Conceptual ERD, optionally include High-confidence or all suggestions; suggested relationships are visually distinct and are not database constraints.
- Show conservative Conceptual ERD cardinality only where schema constraints prove a value.
- Copy Markdown documentation with clipboard feedback or download `schemadoc-documentation.md`.
- Process SQL locally in the browser.

## How It Works

1. Paste SQL or upload a `.sql` file. Use **Load Example** to try a sample schema.
2. Review the SQL, then select **Generate Documentation**. Uploading a file does not generate documentation automatically.
3. Review the schema overview, tables, columns, keys, defined relationships, and suggested relationships.
4. Choose **Technical ERD** or **Conceptual ERD**. In the Conceptual ERD, filter tables and relationship sources as needed.
5. Select **Copy Documentation** or **Export Markdown**.

## Privacy

SQL text and files are processed locally in your browser. Files are read with browser APIs, and parsing, ERD generation, clipboard copying, and Markdown downloads happen on the client. SchemaDoc does not upload SQL dumps to a backend or require a database connection.

## Supported SQL

Schema extraction currently includes:

- Multiple `CREATE TABLE` statements, optional `IF NOT EXISTS`, backtick identifiers, and `--` line comments.
- Column types such as `INT`, `BIGINT`, `VARCHAR(n)`, `TEXT`, `DATE`, `DATETIME`, and `DECIMAL(p,s)`.
- Inline and table-level primary keys, including composite primary keys.
- Inline and table-level UNIQUE constraints, including composite UNIQUE keys.
- Named and unnamed `FOREIGN KEY (...) REFERENCES table (...)` constraints, including grouped composite foreign keys.
- `NOT NULL`, `DEFAULT` values, and column-level `AUTO_INCREMENT`. Defaults retain their SQL spelling.
- `ALTER TABLE ADD PRIMARY KEY`, `ADD UNIQUE [KEY/INDEX]`, `ADD KEY`, `ADD INDEX`, and `ADD [CONSTRAINT name] FOREIGN KEY`.
- `ALTER TABLE MODIFY [COLUMN]` and `CHANGE [COLUMN]` definitions. Existing keys are preserved, and renames update recorded relationships.
- Comma-separated supported ALTER operations, including table-level `AUTO_INCREMENT=n` counters.

The parser also accepts these supported dump and storage details:

- Dump statements: `SET`, `START TRANSACTION`, `COMMIT`, `INSERT INTO`, `LOCK TABLES`, `UNLOCK TABLES`, `DROP TABLE IF EXISTS`, `USE`, and `CREATE DATABASE`. They are skipped, not executed.
- Empty MySQL version comments (`/*! ... */`) or those containing recognized non-schema dump statements.
- Ordinary `KEY` and `INDEX` definitions. They are not stored as UNIQUE constraints.
- Table-level `KEY`, `INDEX`, and `CHECK` definitions in `CREATE TABLE`.
- Common storage options: `ENGINE`, `CHARSET`/`CHARACTER SET`, `COLLATE`, and table-level `AUTO_INCREMENT` counters.
- Column modifiers such as `UNSIGNED`, `SIGNED`, `ZEROFILL`, `UNIQUE`, `COMMENT`, and supported `ON UPDATE` expressions; foreign-key `ON DELETE`/`ON UPDATE` actions are recognized but not documented.

## Limitations

- This is a schema extractor, not a complete MySQL parser or validator. Skipped statements and some accepted definitions are not fully validated. Not every phpMyAdmin dump will parse.
- Unsupported ALTER operations, including `ADD COLUMN`, `DROP COLUMN`, and `RENAME TO`, produce errors. ALTER operations require the table to have already been defined.
- General block comments, schema-qualified table names, and statements such as `SELECT` and `DELETE` are not supported.
- Suggested relationships are naming-based hints, not foreign-key constraints. They are separated from defined relationships and may be filtered by High or Medium confidence.
- The Technical ERD is Mermaid-based and shows defined schema relationships. The Conceptual ERD is React Flow-based and can optionally show suggestions. Its cardinality labels appear only when constraints prove a supported value; unknown and unsupported many bounds are not guessed.
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

- PostgreSQL support
- PDF/DOCX export
- Schema comparison

## License

Licensing information has not yet been added.
