import React from "react";
import { render } from "ink";
import { cac } from "cac";
import { App } from "./app.js";

const cli = cac("ai-companion");

cli
  .command("[prompt]", "Launch AI Companion CLI")
  .option("--session <id>", "Open a specific session by id")
  .action((_prompt, options) => {
    render(React.createElement(App, { initialSessionId: options.session }));
  });

cli.help();
cli.parse();
