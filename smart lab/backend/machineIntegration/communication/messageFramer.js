/**
 * Prevents TCP chunk boundaries from becoming message boundaries. MLLP and
 * ASTM control characters have deterministic framing; for a documented
 * unframed vendor feed we flush after a quiet period rather than pretending a
 * newline is universally valid.
 */
export class MessageFramer {
  constructor({ protocol, onMessage, idleMs = 75 }) {
    this.protocol = protocol;
    this.onMessage = onMessage;
    this.idleMs = idleMs;
    this.buffer = '';
    this.timer = null;
  }

  push(chunk) {
    this.buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (this.protocol === 'HL7' && this.buffer.includes('\x0b')) return this.#drainMllp();
    if (this.protocol === 'ASTM' && this.buffer.includes('\x02') && this.buffer.includes('\x04')) return this.#drainAstm();
    this.#scheduleFlush();
  }

  #drainMllp() {
    let end;
    while ((end = this.buffer.indexOf('\x1c\r')) !== -1) {
      const start = this.buffer.indexOf('\x0b');
      if (start === -1 || start > end) { this.buffer = this.buffer.slice(end + 2); continue; }
      const message = this.buffer.slice(start, end + 2);
      this.buffer = this.buffer.slice(end + 2);
      this.onMessage(message);
    }
    this.#scheduleFlush();
  }

  #drainAstm() {
    let end;
    while ((end = this.buffer.indexOf('\x04')) !== -1) {
      const start = this.buffer.indexOf('\x02');
      if (start === -1 || start > end) { this.buffer = this.buffer.slice(end + 1); continue; }
      const message = this.buffer.slice(start, end + 1);
      this.buffer = this.buffer.slice(end + 1);
      this.onMessage(message);
    }
    this.#scheduleFlush();
  }

  #scheduleFlush() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.idleMs);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const message = this.buffer.trim();
    this.buffer = '';
    if (message) this.onMessage(message);
  }

  close() { this.flush(); }
}
