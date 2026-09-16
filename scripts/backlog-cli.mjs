#!/usr/bin/env node
// backlog CLI — the only sanctioned way to change docs/current/backlog.json
// (CLAUDE.md: "backlog.json은 CLI로만 바꾼다. 직접 편집하지 않는다";
// .claude/hooks/guard.mjs blocks direct Write/Edit/shell edits to the file).
//
// Usage:
//   node scripts/backlog-cli.mjs list [--phase P1] [--status todo]
//   node scripts/backlog-cli.mjs update WK-083 --status done
//   node scripts/backlog-cli.mjs update WK-083 --status in_progress

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backlogPath = path.resolve(__dirname, '..', 'docs', 'current', 'backlog.json');

function loadBacklog() {
  return JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
}

function saveBacklog(data) {
  fs.writeFileSync(backlogPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cmdList(args) {
  const data = loadBacklog();
  const phaseFilter = flagValue(args, '--phase');
  const statusFilter = flagValue(args, '--status');
  const tasks = data.tasks.filter(
    (t) => (!phaseFilter || t.priority === phaseFilter) && (!statusFilter || t.status === statusFilter)
  );
  for (const t of tasks) {
    console.log(`${t.id}\t${t.priority}\t${t.status}\t${t.title}`);
  }
  console.log(`\n${tasks.length} task(s)`);
}

function cmdUpdate(args) {
  const id = args[0];
  if (!id) {
    console.error('usage: update <id> --status <status>');
    process.exit(1);
  }
  const status = flagValue(args, '--status');
  if (!status) {
    console.error('update requires --status');
    process.exit(1);
  }
  const data = loadBacklog();
  if (!data.enums.status.includes(status)) {
    console.error(`invalid status "${status}"; must be one of ${data.enums.status.join(', ')}`);
    process.exit(1);
  }
  const task = data.tasks.find((t) => t.id === id);
  if (!task) {
    console.error(`no task with id ${id}`);
    process.exit(1);
  }
  const prevStatus = task.status;
  task.status = status;
  task.done_at = status === 'done' ? todayIso() : null;
  data.meta.updated = todayIso();
  saveBacklog(data);
  console.log(`${id}: ${prevStatus} -> ${status}`);
}

function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const [, , cmd, ...rest] = process.argv;
if (cmd === 'list') cmdList(rest);
else if (cmd === 'update') cmdUpdate(rest);
else {
  console.error('usage: backlog-cli.mjs <list|update> ...');
  process.exit(1);
}
