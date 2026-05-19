import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PluginClient, TauriPage } from '@srsholmes/tauri-playwright';

const SOCKET_PATH =
  process.env.TAURI_MCP_SOCKET ?? '/tmp/tauri-playwright.sock';

let client: PluginClient | null = null;
let page: TauriPage | null = null;

async function getPage(): Promise<TauriPage> {
  if (page) return page;
  client = new PluginClient(SOCKET_PATH);
  await client.connect();
  const ping = await client.send({ type: 'ping' });
  if (!ping.ok)
    throw new Error(
      'Tauri plugin ping failed — is the app running with --features e2e-testing?'
    );
  page = new TauriPage(client);
  return page;
}

function disconnect() {
  client?.disconnect();
  client = null;
  page = null;
}

const server = new Server(
  { name: 'tauri-skillmon', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'screenshot',
      description: 'Capture a screenshot of the Tauri app window',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'click',
      description:
        'Click an element by CSS selector (auto-waits for visible + enabled)',
      inputSchema: {
        type: 'object',
        required: ['selector'],
        properties: {
          selector: { type: 'string' },
          timeout_ms: { type: 'number' },
        },
      },
    },
    {
      name: 'fill',
      description: 'Fill an input element with text',
      inputSchema: {
        type: 'object',
        required: ['selector', 'text'],
        properties: {
          selector: { type: 'string' },
          text: { type: 'string' },
          timeout_ms: { type: 'number' },
        },
      },
    },
    {
      name: 'press',
      description: 'Press a key on an element (e.g. "Enter", "Tab", "Escape")',
      inputSchema: {
        type: 'object',
        required: ['selector', 'key'],
        properties: {
          selector: { type: 'string' },
          key: { type: 'string' },
          timeout_ms: { type: 'number' },
        },
      },
    },
    {
      name: 'text_content',
      description: 'Get text content of an element',
      inputSchema: {
        type: 'object',
        required: ['selector'],
        properties: {
          selector: { type: 'string' },
          timeout_ms: { type: 'number' },
        },
      },
    },
    {
      name: 'inner_html',
      description: 'Get inner HTML of an element',
      inputSchema: {
        type: 'object',
        required: ['selector'],
        properties: {
          selector: { type: 'string' },
          timeout_ms: { type: 'number' },
        },
      },
    },
    {
      name: 'get_attribute',
      description: 'Get an attribute value from an element',
      inputSchema: {
        type: 'object',
        required: ['selector', 'name'],
        properties: {
          selector: { type: 'string' },
          name: { type: 'string' },
          timeout_ms: { type: 'number' },
        },
      },
    },
    {
      name: 'evaluate',
      description: 'Evaluate a JavaScript expression in the Tauri webview',
      inputSchema: {
        type: 'object',
        required: ['script'],
        properties: { script: { type: 'string' } },
      },
    },
    {
      name: 'invoke',
      description: 'Call a Tauri IPC command (requires withGlobalTauri: true)',
      inputSchema: {
        type: 'object',
        required: ['command'],
        properties: {
          command: { type: 'string' },
          args: { type: 'object' },
        },
      },
    },
    {
      name: 'wait_for_selector',
      description:
        'Wait until an element matching the selector appears in the DOM',
      inputSchema: {
        type: 'object',
        required: ['selector'],
        properties: {
          selector: { type: 'string' },
          timeout_ms: { type: 'number' },
        },
      },
    },
    {
      name: 'is_visible',
      description: 'Check if an element is visible (instant, no waiting)',
      inputSchema: {
        type: 'object',
        required: ['selector'],
        properties: { selector: { type: 'string' } },
      },
    },
    {
      name: 'count',
      description: 'Count elements matching a selector',
      inputSchema: {
        type: 'object',
        required: ['selector'],
        properties: { selector: { type: 'string' } },
      },
    },
    {
      name: 'url',
      description: 'Get the current page URL',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'title',
      description: 'Get the current page title',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'content',
      description: 'Get the full page HTML',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'disconnect',
      description:
        'Disconnect from the Tauri app socket (reconnects automatically on next call)',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'disconnect') {
    disconnect();
    return { content: [{ type: 'text', text: 'Disconnected.' }] };
  }

  try {
    const p = await getPage();

    switch (name) {
      case 'screenshot': {
        const buf = await p.screenshot();
        return {
          content: [
            {
              type: 'image',
              data: buf.toString('base64'),
              mimeType: 'image/png',
            },
          ],
        };
      }

      case 'click':
        await p.click(args!.selector as string, {
          timeout: args!.timeout_ms as number | undefined,
        });
        return {
          content: [{ type: 'text', text: `Clicked: ${args!.selector}` }],
        };

      case 'fill':
        await p.fill(args!.selector as string, args!.text as string);
        return {
          content: [{ type: 'text', text: `Filled: ${args!.selector}` }],
        };

      case 'press':
        await p.press(args!.selector as string, args!.key as string);
        return {
          content: [
            {
              type: 'text',
              text: `Pressed ${args!.key} on: ${args!.selector}`,
            },
          ],
        };

      case 'text_content': {
        const text = await p.textContent(args!.selector as string);
        return { content: [{ type: 'text', text: text ?? '(empty)' }] };
      }

      case 'inner_html': {
        const html = await p.innerHTML(args!.selector as string);
        return { content: [{ type: 'text', text: html }] };
      }

      case 'get_attribute': {
        const val = await p.getAttribute(
          args!.selector as string,
          args!.name as string
        );
        return { content: [{ type: 'text', text: val ?? '(null)' }] };
      }

      case 'evaluate': {
        const result = await p.evaluate(args!.script as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'invoke': {
        const argsStr = JSON.stringify(args!.args ?? {});
        const result = await p.evaluate(
          `window.__TAURI__.core.invoke(${JSON.stringify(args!.command)}, ${argsStr})`
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'wait_for_selector':
        await p.waitForSelector(
          args!.selector as string,
          args!.timeout_ms as number | undefined
        );
        return {
          content: [{ type: 'text', text: `Found: ${args!.selector}` }],
        };

      case 'is_visible': {
        const visible = await p.isVisible(args!.selector as string);
        return { content: [{ type: 'text', text: String(visible) }] };
      }

      case 'count': {
        const n = await p.count(args!.selector as string);
        return { content: [{ type: 'text', text: String(n) }] };
      }

      case 'url': {
        const url = await p.url();
        return { content: [{ type: 'text', text: url }] };
      }

      case 'title': {
        const title = await p.title();
        return { content: [{ type: 'text', text: title }] };
      }

      case 'content': {
        const html = await p.content();
        return { content: [{ type: 'text', text: html }] };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    disconnect();
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${msg}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
