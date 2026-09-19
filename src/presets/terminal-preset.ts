import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
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

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      cursorInactiveStyle: 'bar',
      fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      convertEol: false,
      scrollback: 10000,
      theme: {
        background: '#0c0c0c',
        foreground: '#cccccc',
        cursor: '#ffffff',
        cursorAccent: '#0c0c0c',
        selectionBackground: 'rgba(255, 255, 255, 0.25)',
        black: '#0c0c0c',
        red: '#c50f1f',
        green: '#13a10e',
        yellow: '#c19c00',
        blue: '#0037da',
        magenta: '#881798',
        cyan: '#3a96dd',
        white: '#cccccc',
        brightBlack: '#767676',
        brightRed: '#e74856',
        brightGreen: '#16c60c',
        brightYellow: '#f9f1a5',
        brightBlue: '#3b78ff',
        brightMagenta: '#b4009e',
        brightCyan: '#61d6d6',
        brightWhite: '#f2f2f2',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    let disposed = false;
    let rafId: number | null = null;

    const fit = () => {
      if (disposed || !element.clientWidth || !element.clientHeight) return;
      try {
        fitAddon.fit();
        if (session?.id && terminal.cols > 0 && terminal.rows > 0) {
          void terminalHost.resize(session.id, terminal.cols, terminal.rows);
        }
      } catch {
        // Element may be hidden or detached during layout switches
      }
    };

    const scheduleFit = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        fit();
      });
    };

    const observer = new ResizeObserver(scheduleFit);

    const input = terminal.onData((data) => {
      if (session?.id && !session.exited) void terminalHost.write(session.id, data);
    });

    const unsubData = terminalHost.onData((id, data) => {
      if (id !== session?.id || disposed) return;
      session.transcript = (session.transcript + data).slice(-100_000);
      terminal.write(data);
    });

    const unsubExit = terminalHost.onExit((id) => {
      if (id !== session?.id || disposed) return;
      session.exited = true;
      session.transcript += '\r\n[Process exited]\r\n';
      terminal.write('\r\n[Process exited]\r\n');
    });

    const focus = () => {
      if (!disposed) {
        terminal.focus();
      }
    };
    element.addEventListener('click', focus);

    requestAnimationFrame(() => {
      if (disposed) return;
      terminal.open(element);
      terminal.write(session!.transcript);
      observer.observe(element);
      fit();
      focus();
      void session!.starting.then(async () => {
        if (disposed) return;
        if (session?.exited) {
          terminal.write(session.transcript);
          focus();
          return;
        }
        if (!session?.id) return;
        fit();
        focus();
        // One-time initial drain for any banner/prompt emitted before streaming hooked
        try {
          const initial = await terminalHost.read(session.id);
          if (initial.output) {
            session.transcript = (session.transcript + initial.output).slice(-100_000);
            terminal.write(initial.output);
          }
          if (initial.exited) {
            session.exited = true;
            terminal.write('\r\n[Process exited]\r\n');
          }
        } catch {
          // Ignore
        }
        focus();
      });
    });

    return {
      element,
      focus,
      dispose: () => {
        disposed = true;
        element.removeEventListener('click', focus);
        observer.disconnect();
        if (rafId != null) cancelAnimationFrame(rafId);
        unsubData();
        unsubExit();
        input.dispose();
        fitAddon.dispose();
        terminal.dispose();
      },
    };
  });
}
