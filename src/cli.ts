/**
 * CLI 入口，负责解析命令行参数并挂载 Ink 应用。
 * 新人从这里可以先看到进程如何进入交互界面，以及退出时如何清理当前渲染树。
 */
import React from "react";
import { render } from "ink";
import { cac } from "cac";
import { App } from "#src/app.js";

const cli = cac("ai-companion");

cli
  .command("[prompt]", "Launch AI Companion CLI")
  .option("--session <id>", "Open a specific session by id")
  .action((_prompt, options) => {
    const interactive = Boolean(process.stdout.isTTY && process.stdin.isTTY);
    let exitRequested = false;
    let renderResult: ReturnType<typeof render> | null = null;

    /**
     * 退出时只清理一次 Ink 渲染结果，避免重复 clear/unmount。
     */
    const requestExit = () => {
      if (exitRequested) {
        return;
      }

      exitRequested = true;
      renderResult?.clear();
      renderResult?.unmount();
    };

    renderResult = render(
      React.createElement(App, {
        initialSessionId: options.session,
        onExitRequested: requestExit,
      }),
      {
        alternateScreen: interactive,
      },
    );
  });

cli.help();
cli.parse();
