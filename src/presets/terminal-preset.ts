import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { ResourceKindRegistry } from '../registry/kind-registry';
import { terminalHost } from '../providers/filesystem';

export const TERMINAL_KIND = 'terminal';

interface TerminalSession {
  id: string | null;
  starting: Promise<void>;
  closed: boolean;
  exited: boolean;
  transcript: string;
}

// Renderers are recreated on layout/workspace restoration; the PTY belongs
// to the tab, and is closed only when that tab is explicitly closed.
const sessions = new Map<string, TerminalSession>();

export function closeTerminalSession(key: string): void {
  const session = sessions.get(key);
  if (!session) return;
  session.closed = true;
  sessions.delete(key);
  if (session.id) void terminalHost.close(session.id).catch(() => {});
}

export function registerTerminalPreset(registry: ResourceKindRegistry): void {
  registry.register(TERMINAL_KIND, (cwd, { params, updateParams }) => {
    const key = typeof params.terminalSessionKey === 'string'
      ? params.terminalSessionKey : crypto.randomUUID();
    if (!params.terminalSessionKey) updateParams({ terminalSessionKey: key });
    const kind = params.mode === 'cmd' ? 'cmd' : 'powershell';
    let session = sessions.get(key);
    if (!session) {
      session = { id: null, starting: Promise.resolve(), closed: false, exited: false, transcript: '' };
      sessions.set(key, session);
      const created = session;
      created.starting = terminalHost.start(kind, cwd).then((id) => {
        if (created.closed) { void terminalHost.close(id).catch(() => {}); return; }
        created.id = id;
      }).catch((error) => {
        created.exited = true;
        created.transcript += `Unable to start terminal: ${String(error)}\r\n`;
      });
    }
    const element = document.createElement('div');
    element.className = 'preset-terminal-view';
    const terminal = new Terminal({ cursorBlink: true, convertEol: false, fontSize: 13, scrollback: 5000 });
    let disposed = false;
    let polling = false;
    const resize = () => {
      if (!session?.id || !element.clientWidth || !element.clientHeight) return;
      const cols = Math.max(2, Math.floor(element.clientWidth / 8));
      const rows = Math.max(2, Math.floor(element.clientHeight / 17));
      terminal.resize(cols, rows);
      void terminalHost.resize(session.id, cols, rows);
    };
    const observer = new ResizeObserver(resize);
    const input = terminal.onData((data) => {
      if (session?.id && !session.exited) void terminalHost.write(session.id, data);
    });
    const poll = async () => {
      if (!session?.id || disposed || polling || session.exited) return;
      polling = true;
      try {
        const result = await terminalHost.read(session.id);
        if (result.output) {
          session.transcript = (session.transcript + result.output).slice(-100_000);
          if (!disposed) terminal.write(result.output);
        }
        if (result.exited) {
          session.exited = true;
          session.transcript += '\r\n[Process exited]\r\n';
          if (!disposed) terminal.write('\r\n[Process exited]\r\n');
          if (timer) clearInterval(timer);
        }
      } catch (error) {
        if (!disposed) terminal.write(`\r\n[Terminal error: ${String(error)}]\r\n`);
        if (timer) clearInterval(timer);
      } finally {
        polling = false;
      }
    };
    let timer: ReturnType<typeof setInterval> | null = null;
    requestAnimationFrame(() => {
      if (disposed) return;
      terminal.open(element);
      terminal.write(session!.transcript);
      observer.observe(element);
      void session!.starting.then(() => {
        if (disposed) return;
        if (session?.exited) {
          terminal.write(session.transcript);
          return;
        }
        if (!session?.id) return;
        resize();
        timer = setInterval(() => void poll(), 60);
        void poll();
      });
    });
    return {
      element,
      dispose: () => {
        disposed = true;
        observer.disconnect();
        input.dispose();
        if (timer) clearInterval(timer);
        terminal.dispose();
      },
    };
  });
}
