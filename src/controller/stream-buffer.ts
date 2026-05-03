import type { ChatRuntimeEvent } from "#src/types/events.js";

type TextDeltaEvent = Extract<ChatRuntimeEvent, { type: "text_delta" }>;

export class StreamBuffer {
  private readonly intervalMs: number;
  private buffer = "";
  private latestEvent: TextDeltaEvent | null = null;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly onFlush: (event: TextDeltaEvent) => void,
    intervalMs = 40,
  ) {
    this.intervalMs = intervalMs;
  }

  push(event: TextDeltaEvent) {
    this.buffer += event.text;
    this.latestEvent = event;
    if (this.timer) {
      return;
    }

    this.timer = setTimeout(() => {
      this.flush();
    }, this.intervalMs);
  }

  flush() {
    if (!this.buffer || !this.latestEvent) {
      this.clearTimer();
      return;
    }

    const event = {
      ...this.latestEvent,
      text: this.buffer,
    } satisfies TextDeltaEvent;
    this.buffer = "";
    this.latestEvent = null;
    this.clearTimer();
    this.onFlush(event);
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
