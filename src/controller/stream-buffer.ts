/**
 * 流式文本缓冲器。
 * 模型 token 到达可能非常频繁，直接逐 token 刷 UI 会导致终端闪烁和状态更新过密，因此先在这里做短时间聚合。
 */
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
    /**
     * 只保留最新事件元数据，把文本累加到 buffer。
     * 到达 flush 时再以一条合并后的 text_delta 交给 UI。
     */
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
