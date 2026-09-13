"use client";

import { useRef, useState } from "react";
import ErdViewer from "@/components/ErdViewer";
import { parseSqlSchema } from "@/lib/sql-parser";
import type { DatabaseSchema } from "@/types/schema";

const SAMPLE_SQL = `CREATE TABLE customers (
  id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255)
);`;

const EXAMPLE_SQL = `${SAMPLE_SQL}

CREATE TABLE orders (
  id INT PRIMARY KEY,
  customer_id INT NOT NULL,
  total DECIMAL(10,2) DEFAULT 0,
  created_at DATETIME,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);`;

export default function Home() {
  const [sql, setSql] = useState("");
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileReadVersion = useRef(0);

  function clearFile() {
    fileReadVersion.current++;
    setFileName(null);
    setFileError(null);
    setReadingFile(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function loadFile(file: File) {
    clearFile();
    const version = fileReadVersion.current;
    if (!file.name.toLowerCase().endsWith(".sql")) {
      setFileError("Please choose a .sql file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError("SQL files larger than 5 MB are not supported yet.");
      return;
    }
    setFileName(file.name);
    setReadingFile(true);
    try {
      const contents = await file.text();
      // A newer selection, manual edit, or removal takes precedence.
      if (version !== fileReadVersion.current) return;
      if (!contents.trim()) {
        setFileError("This SQL file is empty. Please choose a file containing SQL.");
        return;
      }
      setSql(contents);
      setSchema(null);
      setError(null);
    } catch {
      if (version === fileReadVersion.current) {
        setFileError("Could not read this SQL file. Please try selecting it again.");
      }
    } finally {
      if (version === fileReadVersion.current) setReadingFile(false);
    }
  }

  function updateSql(value: string) {
    clearFile();
    setSql(value);
    setSchema(null);
    setError(null);
  }

  function generateDocumentation() {
    setError(null);
    setSchema(null);
    if (!sql.trim()) {
      setError("Please enter some SQL first.");
      return;
    }
    try {
      const result = parseSqlSchema(sql);
      if (!result.tables.length) {
        setError("No tables found. Use MySQL CREATE TABLE statements, like the sample below.");
        return;
      }
      setSchema(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not parse SQL. Check your SQL syntax.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          <div className="mb-3 flex items-center gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 font-mono text-lg font-bold text-white">{"{}"}</span>
            <h1 className="text-2xl font-semibold tracking-tight">SchemaDoc</h1>
          </div>
          <p className="text-sm text-slate-600 sm:text-base">Turn SQL schemas into clear database documentation.</p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-8 sm:py-10">
        <section aria-labelledby="input-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
            <div>
              <h2 id="input-heading" className="font-semibold">SQL schema</h2>
              <p id="sql-help" className="mt-1 text-sm text-slate-500">Paste one or more MySQL CREATE TABLE statements.</p>
            </div>
            <button type="button" onClick={() => updateSql(EXAMPLE_SQL)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
              Load Example
            </button>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); generateDocumentation(); }} className="p-5 sm:p-6">
            <div className="mb-5 space-y-2">
              <label htmlFor="sql-file" className="block text-sm font-medium">Load a SQL file</label>
              <input
                ref={fileInput}
                id="sql-file"
                type="file"
                accept=".sql"
                aria-describedby={fileError ? "file-help file-error" : "file-help"}
                aria-invalid={Boolean(fileError)}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadFile(file);
                }}
                className="block w-full min-w-0 rounded-lg border border-slate-300 p-2 text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium file:text-slate-800 hover:file:bg-slate-200 focus-visible:outline-2 focus-visible:outline-indigo-600"
              />
              <p id="file-help" className="text-xs text-slate-500">.sql files up to 5 MB. Read locally; review the SQL before generating documentation.</p>
              {fileName && (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <p role="status" className="min-w-0 break-all text-slate-600">{readingFile ? "Reading: " : "Selected file: "}{fileName}</p>
                  <button type="button" onClick={() => { clearFile(); setSql(""); setSchema(null); setError(null); }} className="rounded px-2 py-1 font-medium text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600">Remove file</button>
                </div>
              )}
              {fileError && <p id="file-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{fileError}</p>}
            </div>
            <label htmlFor="sql-input" className="sr-only">SQL input</label>
            <textarea
              id="sql-input"
              value={sql}
              onChange={(event) => updateSql(event.target.value)}
              placeholder={SAMPLE_SQL}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "sql-help sql-error" : "sql-help"}
              className="block min-h-80 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-sm leading-7 text-slate-100 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-2 focus:outline-indigo-400 sm:p-5"
            />
            {error && <p id="sql-error" role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-slate-500">Your SQL stays in your browser.</p>
              <button type="submit" disabled={readingFile} className="w-full rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
                Generate Documentation
              </button>
            </div>
          </form>
        </section>

        <p role="status" className="sr-only">{schema ? `Documentation generated for ${schema.tables.length} tables.` : ""}</p>

        {!schema ? (
          <section aria-labelledby="sample-heading" className="grid gap-6 rounded-2xl border border-dashed border-slate-300 p-5 sm:p-6 md:grid-cols-2">
            <div>
              <h2 id="sample-heading" className="font-semibold">Start with a simple schema</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">Try this customers table, or choose Load Example to explore two tables and their relationship. Your table and column documentation will appear here.</p>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-white p-4 font-mono text-xs leading-6 text-slate-700"><code>{SAMPLE_SQL}</code></pre>
          </section>
        ) : (
          <div className="space-y-8">
            <section aria-labelledby="overview-heading">
              <h2 id="overview-heading" className="mb-4 text-lg font-semibold">Schema overview</h2>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { label: "Tables", value: schema.tables.length },
                  { label: "Columns", value: schema.tables.reduce((total, table) => total + table.columns.length, 0) },
                  { label: "Relationships", value: schema.relationships.length },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white p-5">
                    <dt className="text-sm text-slate-500">{label}</dt>
                    <dd className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-labelledby="tables-heading" className="space-y-4">
              <h2 id="tables-heading" className="text-lg font-semibold">Tables</h2>
              {schema.tables.map((table, tableIndex) => (
                <article key={`${table.name}-${tableIndex}`} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
                    <h3 className="break-all font-mono font-semibold">{table.name}</h3>
                    <span className="text-xs text-slate-500">{table.columns.length} columns</span>
                  </div>
                  <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-indigo-600" tabIndex={0} role="region" aria-label={`${table.name} columns`}>
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">Columns in {table.name}</caption>
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>{["Column", "Data type", "Keys", "Nullable", "Default"].map((label) => <th key={label} scope="col" className="whitespace-nowrap px-5 py-3 font-medium">{label}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {table.columns.map((column, columnIndex) => (
                          <tr key={`${column.name}-${columnIndex}`}>
                            <th scope="row" className="px-5 py-4 font-mono font-medium">{column.name}</th>
                            <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-slate-600">{column.dataType}</td>
                            <td className="px-5 py-4">
                              <div className="flex gap-1.5">
                                {column.isPrimaryKey && <abbr title="Primary key" className="rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 no-underline">PK</abbr>}
                                {column.isForeignKey && <abbr title="Foreign key" className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 no-underline">FK</abbr>}
                                {column.isAutoIncrement && <span className="whitespace-nowrap rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">AUTO_INCREMENT</span>}
                                {!column.isPrimaryKey && !column.isForeignKey && !column.isAutoIncrement && <span className="text-slate-400">—</span>}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-slate-600">{column.nullable ? "NULL" : "NOT NULL"}</td>
                            <td className="px-5 py-4 font-mono text-xs text-slate-600">{column.defaultValue !== null ? column.defaultValue : <span aria-label="No default" className="text-slate-400">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </section>

            <section aria-labelledby="erd-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 id="erd-heading" className="text-lg font-semibold">Entity Relationship Diagram</h2>
              <ErdViewer schema={schema} />
            </section>

            <section aria-labelledby="relationships-heading" className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 id="relationships-heading" className="text-lg font-semibold">Relationships</h2>
              {schema.relationships.length ? (
                <ul className="mt-4 space-y-3">
                  {schema.relationships.map((relationship, index) => (
                    <li key={index} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 font-mono text-sm">
                      <span className="break-all">{relationship.sourceTable}.{relationship.sourceColumn}</span>
                      <span aria-label="references" className="text-indigo-600">→</span>
                      <span className="break-all">{relationship.targetTable}.{relationship.targetColumn}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-slate-500">No foreign key relationships found in this schema.</p>}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
