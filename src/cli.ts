import React from "react";
import { render } from "ink";
import { cac } from "cac";
import { App } from "./app.js";

const cli = cac("ai-companion");

cli
  .command("[prompt]", "Launch AI Companion CLI")
  .option("--session <id>", "Open a specific session by id")
  .action((_prompt, options) => {
    const interactive = Boolean(process.stdout.isTTY && process.stdin.isTTY);
    let exitRequested = false;
    let renderResult: ReturnType<typeof render> | null = null;

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
