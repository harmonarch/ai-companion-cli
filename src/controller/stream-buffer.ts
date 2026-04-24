export class StreamBuffer {
  private readonly intervalMs: number;
  private buffer = "";
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly onFlush: (chunk: string) => void,
    intervalMs = 40,
  ) {
    this.intervalMs = intervalMs;
  }

  push(chunk: string) {
    this.buffer += chunk;
    if (this.timer) {
      return;
    }

    this.timer = setTimeout(() => {
      this.flush();
    }, this.intervalMs);
  }

  flush() {
    if (!this.buffer) {
      this.clearTimer();
      return;
    }

    const chunk = this.buffer;
    this.buffer = "";
    this.clearTimer();
    this.onFlush(chunk);
  }

  close() {
    this.flush();
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
