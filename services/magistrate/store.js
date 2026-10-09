// Durable state of the Magistrate service (cursor, deposits seen, decisions, last publication).
// The CHAIN stays the source of truth: if this file is lost the service rebuilds everything by rescanning from the
// deploy block; the state only makes restarts cheap and keeps an append-only audit log of every decision change.
const fs = require("fs");
const path = require("path");

class FileStore {
  constructor(file, { auditFile = null } = {}) {
    this.file = file;
    this.auditFile = auditFile || (file ? file.replace(/\.json$/, "") + ".decisions.jsonl" : null);
    this.state = { cursor: null, deposits: {}, ragequit: [], lastPublish: null };
    if (file && fs.existsSync(file)) {
      try { this.state = { ...this.state, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch (_) { /* corrupt file: rebuild from chain */ }
    }
  }
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 1));
    fs.renameSync(tmp, this.file); // atomic: a crash never leaves half a file
  }
  audit(entry) {
    if (!this.auditFile) return;
    fs.mkdirSync(path.dirname(this.auditFile), { recursive: true });
    fs.appendFileSync(this.auditFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  }
}

/** In-memory store for tests. */
class MemoryStore extends FileStore {
  constructor() { super(null); this.log = []; }
  save() {}
  audit(entry) { this.log.push(entry); }
}

module.exports = { FileStore, MemoryStore };
