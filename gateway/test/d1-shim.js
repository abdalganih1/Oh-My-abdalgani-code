// Minimal Cloudflare D1 shim on node:sqlite for tests.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const norm = (args) => args.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, norm(args)); }
  _p() { return this.db.prepare(this.sql); }
  async first(col) { const r = this._p().get(...this.args); return r == null ? null : col ? r[col] : { ...r }; }
  async all() { return { results: this._p().all(...this.args).map((r) => ({ ...r })), success: true }; }
  async run() { const r = this._p().run(...this.args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  _runSync() { const r = this._p().run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
}

export class D1Shim {
  constructor() { this.db = new DatabaseSync(':memory:'); this.db.exec('PRAGMA foreign_keys = ON'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try { const out = stmts.map((s) => s._runSync()); this.db.exec('COMMIT'); return out; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  async exec(sql) { this.db.exec(sql); }
  migrate(dir) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) this.db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    return this;
  }
}
