import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import type { ResourceKindRegistry } from '../registry/kind-registry';
import { terminalHost } from '../providers/filesystem';

export const TERMINAL_KIND = 'terminal';

interface TerminalSession {
  id: string | null;
  starting: Promise<void>;
  closed: boolean;
  exited: boolean;
  ready: boolean;
  pending: string[];
  pendingExit: boolean;
  transcript: string;
  views: Set<(data: string) => void>;
  unsubscribeData: () => void;
  unsubscribeExit: () => void;
}

// A layout switch disposes renderers, not tabs. Keep the stream subscription
// and bounded transcript alive until the tab itself is explicitly closed.
const sessions = new Map<string, TerminalSession>();
const EXIT_MESSAGE = '\r\n[Process exited]\r\n';

function append(session: TerminalSession, data: string): void {
  if (session.closed || !data) return;
  session.transcript = (session.transcript + data).slice(-100_000);
  session.views.forEach((view) => view(data));
}

function markExited(session: TerminalSession): void {
  if (session.closed || session.exited) return;
  session.exited = true;
  append(session, EXIT_MESSAGE);
}

function createSession(key: string, kind: 'cmd' | 'powershell', cwd: string): TerminalSession {
  const session: TerminalSession = {
    id: null, starting: Promise.resolve(), closed: false, exited: false,
    ready: false, pending: [], pendingExit: false, transcript: '',
    views: new Set(), unsubscribeData: () => {}, unsubscribeExit: () => {},
  };
  sessions.set(key, session);
  session.unsubscribeData = terminalHost.onData((id, data) => {
    if (id !== session.id || session.closed) return;
    if (!session.ready) session.pending.push(data);
    else append(session, data);
  });
  session.unsubscribeExit = terminalHost.onExit((id) => {
    if (id !== session.id || session.closed) return;
    if (!session.ready) session.pendingExit = true;
    else markExited(session);
  });
  session.starting = terminalHost.start(kind, cwd).then(async (id) => {
    if (session.closed) { await terminalHost.close(id).catch(() => {}); return; }
    session.id = id;
    // The host buffers only until this one-time attach. Pushes arriving
    // before its reply are queued above and appended after the buffer.
    const initial = await terminalHost.read(id);
    if (session.closed) return;
    append(session, initial.output);
    session.ready = true;
    for (const chunk of session.pending) append(session, chunk);
    session.pending = [];
    if (initial.exited || session.pendingExit) markExited(session);
  }).catch((error) => {
    if (session.closed) return;
    session.ready = true;
    session.exited = true;
    append(session, `Unable to start terminal: ${String(error)}\r\n`);
  });
  return session;
}

export function closeTerminalSession(key: string): void {
  const session = sessions.get(key);
  if (!session) return;
  session.closed = true;
  sessions.delete(key);
  session.unsubscribeData();
  session.unsubscribeExit();
  session.views.clear();
  if (session.id) void terminalHost.close(session.id).catch(() => {});
}

export function registerTerminalPreset(registry: ResourceKindRegistry): void {
  // Tab look (user request, 2026-09-23): VS Code's own shell glyphs for a
  // terminal opened in the editor area, so a folder's File List, Command
  // Prompt and PowerShell tabs no longer read the same.
  registry.registerTabDecorator(TERMINAL_KIND, (params, title) => {
    const targetId = typeof params.targetId === 'string' ? params.targetId : title;
    const cmd = params.mode === 'cmd';
    return {
      // A codicon glyph is the same under every icon theme — `theme` is
      // required by the type but never read for a codicon, and no `color`
      // lets it follow the tab's own text colour.
      icon: { theme: 'seti', kind: 'codicon', cssClass: cmd ? 'codicon-terminal-cmd' : 'codicon-terminal-powershell' },
      tooltip: `${targetId} — ${cmd ? 'Command Prompt' : 'PowerShell'}`,
    };
  });
  registry.register(TERMINAL_KIND, (cwd, { params, updateParams }) => {
    const key = typeof params.terminalSessionKey === 'string'
      ? params.terminalSessionKey : crypto.randomUUID();
    if (!params.terminalSessionKey) updateParams({ terminalSessionKey: key });
    const kind = params.mode === 'cmd' ? 'cmd' : 'powershell';
    const session = sessions.get(key) || createSession(key, kind, cwd);
    const element = document.createElement('div');
    element.className = 'preset-terminal-view';

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      cursorInactiveStyle: 'bar',
      // Windows mono faces size their ASCII advance independently of the CJK
      // cell: at 13px Consolas advances 7.7px and Cascadia Mono 8.2px against
      // a 14px Hangul glyph, so one Hangul character stops being exactly two
      // ASCII columns and every mixed line drifts out of the grid (user
      // report, 2026-09-20). D2Coding designs both together and holds the
      // 2:1 cell. `monospace` behind it holds 2:1 too but resolves to
      // GulimChe here, so it is a fallback only.
      fontFamily: "'D2Coding', monospace",
      fontSize: 14,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      letterSpacing: 0,
      lineHeight: 1.1,
      // Canvas/WebGL renderers draw box characters as continuous custom
      // glyphs instead of relying on font metrics. This is what keeps TUI
      // frames such as the Codex welcome boxes joined at their right edge.
      customGlyphs: true,
      convertEol: false,
      scrollback: 10000,
      theme: {
        background: '#0c0c0c', foreground: '#cccccc', cursor: '#ffffff',
        cursorAccent: '#0c0c0c', selectionBackground: 'rgba(255, 255, 255, 0.25)',
        black: '#0c0c0c', red: '#c50f1f', green: '#13a10e', yellow: '#c19c00',
        blue: '#0037da', magenta: '#881798', cyan: '#3a96dd', white: '#cccccc',
        brightBlack: '#767676', brightRed: '#e74856', brightGreen: '#16c60c',
        brightYellow: '#f9f1a5', brightBlue: '#3b78ff', brightMagenta: '#b4009e',
        brightCyan: '#61d6d6', brightWhite: '#f2f2f2',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    let disposed = false;
    let rafId: number | null = null;
    let lastSize = '';

    const fit = () => {
      if (disposed || !element.clientWidth || !element.clientHeight) return;
      try {
        fitAddon.fit();
        const size = `${terminal.cols}x${terminal.rows}`;
        if (session.id && terminal.cols > 0 && terminal.rows > 0 && size !== lastSize) {
          lastSize = size;
          void terminalHost.resize(session.id, terminal.cols, terminal.rows);
        }
      } catch {
        // A hidden/detached panel can briefly have no measurable geometry.
      }
    };
    const scheduleFit = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => { rafId = null; fit(); });
    };
    const observer = new ResizeObserver(scheduleFit);
    const input = terminal.onData((data) => {
      if (session.id && !session.exited) void terminalHost.write(session.id, data);
    });
    const showData = (data: string) => { if (!disposed) terminal.write(data); };
    const focus = () => {
      if (!disposed && element.isConnected && element.clientWidth && element.clientHeight) terminal.focus();
    };
    element.addEventListener('click', focus);

    requestAnimationFrame(() => {
      if (disposed) return;
      terminal.open(element);
      // The DOM renderer cannot use xterm's custom box glyphs. Prefer WebGL
      // for Windows Terminal-like connected lines, while keeping DOM as a
      // functional fallback when the GPU/context is unavailable or lost.
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => webglAddon.dispose());
        terminal.loadAddon(webglAddon);
      } catch (error) {
        console.warn('[Terminal] WebGL renderer unavailable; using DOM renderer.', error);
      }
      terminal.write(session.transcript);
      session.views.add(showData);
      observer.observe(element);
      fit();
      focus();
      void session.starting.then(() => { if (!disposed) { fit(); focus(); } });
    });

    return {
      element,
      focus,
      getContentForTest: () => session.transcript,
      dispose: () => {
        disposed = true;
        session.views.delete(showData);
        element.removeEventListener('click', focus);
        observer.disconnect();
        if (rafId != null) cancelAnimationFrame(rafId);
        input.dispose();
        fitAddon.dispose();
        terminal.dispose();
      },
    };
  });
}
