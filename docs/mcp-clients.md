# Connect Codex and Claude to Workshape

Workshape serves MCP at `/api/mcp` over Streamable HTTP. Every call uses a separate bearer token for a Workshape participant; browser cookies do not authenticate MCP. The server resolves that participant and applies the same case access and workflow rules as the web app.

## Local connection with Codex CLI or Claude Code

1. Use a database containing individually provisioned accounts. Set `WORKSHAPE_USER_EMAIL` to the account email for the person connecting the client.
2. Start Workshape on loopback with local MCP tokens enabled:

   ```sh
   WORKSHAPE_ALLOW_LOCAL_MCP_TOKENS=1 npm run dev
   ```

3. In the terminal that launches Codex or Claude Code, issue an eight-hour token for that participant:

   ```sh
   export WORKSHAPE_MCP_TOKEN="$(npm run --silent account -- token --email "$WORKSHAPE_USER_EMAIL")"
   ```

   The account command prints the token. Keep it out of committed files and logs. Issue another token when it expires. Use a different participant account for each person; this token is independent of browser sign-in.

4. Start a new Codex or Claude Code session from this repository. Codex reads `.codex/config.toml`; Claude Code reads `.mcp.json`. Both point to `http://127.0.0.1:3000/api/mcp` and use `WORKSHAPE_MCP_TOKEN` without putting its value in the repository. Check the MCP server list in the client, then ask it to list Workshape processes.

The Claude Code configuration accepts `WORKSHAPE_MCP_URL` to replace the default endpoint. For Codex, change the URL in `.codex/config.toml` or register a different server using `codex mcp add workshape --url <url> --bearer-token-env-var WORKSHAPE_MCP_TOKEN` outside this project. Do not commit a personal deployment URL or token. Codex CLI, its IDE extension, and the ChatGPT desktop app share local MCP configuration; hosted ChatGPT chats use plugins instead of this local configuration. [Codex MCP setup](https://learn.chatgpt.com/docs/extend/mcp)

Claude Code may ask you to trust this repository's project MCP configuration. `claude mcp list` and `/mcp` show connection status. The `.mcp.json` file is for Claude Code; Claude's web custom connector uses a public remote server. [Claude Code MCP setup](https://code.claude.com/docs/en/mcp)

## Local Claude Desktop

Claude Desktop can launch Workshape directly over stdio. It uses the same seven tools and participant checks as `/api/mcp`, and does not need the Next.js server running. First issue a token into a private file for the participant:

```sh
install -d -m 700 "$HOME/.config/workshape"
install -m 600 /dev/null "$HOME/.config/workshape/mcp.token"
npm run --silent account -- token --email "$WORKSHAPE_USER_EMAIL" > "$HOME/.config/workshape/mcp.token"
```

Add a `workshape` entry to Claude Desktop's `mcpServers` configuration. On macOS, the file is `~/Library/Application Support/Claude/claude_desktop_config.json`; merge the entry into an existing file rather than replacing its other servers. Use absolute paths for Node, the script, token file, and database:

```json
{
  "mcpServers": {
    "workshape": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/workshape/scripts/mcp-stdio.mjs"],
      "env": {
        "WORKSHAPE_ALLOW_LOCAL_MCP_TOKENS": "1",
        "WORKSHAPE_MCP_TOKEN_FILE": "/absolute/path/to/mcp.token",
        "WORKSHAPE_DB": "/absolute/path/to/workshape/data/workshape.sqlite"
      }
    }
  }
}
```

Run `command -v node` to find Node's absolute path. The Workshape repository must have dependencies installed with `npm ci`. Fully quit and reopen Claude Desktop, then check the local MCP server under **Settings → Desktop app → Extensions** or the chat's **Connectors** menu. The token file must be readable only by its owner. Replace its contents with a fresh token after eight hours. The stdio launcher checks token expiry on every call and refuses to start if public OAuth settings are present. [Claude Desktop local servers](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop), [MCP host configuration](https://py.sdk.modelcontextprotocol.io/get-started/real-host/)

## What clients can do

| Tool | Result |
| --- | --- |
| `list_processes`, `get_process` | Discover the current published form and required fields. |
| `submit_request` | Create a request as the authenticated participant. Reuse `requestKey` on retry. |
| `list_my_requests` | See accessible case summaries without answers or notes. |
| `get_request_status` | See minimal status and assignment without answers. |
| `get_request` | See answers, shared history, and a pending clarification for one accessible case. |
| `respond_to_request` | Answer the pending question with a note and complete corrected field values, using `expectedEvent` from `get_request`. |

Before submitting or responding, have the client show the exact values to the person for confirmation. A different participant cannot read the case by guessing its ID. A stale response is rejected. Review decisions, delegation, process editing, and publication remain web actions.

Example requests to a connected client:

- “Show the published Workshape processes and what the flexible-work form asks for.”
- “Show my Workshape requests that need me.”
- “Read the question on my request, help me prepare a response, then show me the final note and answers before sending.”

## Deployed access and Claude web

For a deployed instance, use HTTPS, a persistent database, and an OAuth issuer. Set `WORKSHAPE_PUBLIC_URL`, `MCP_OAUTH_ISSUER`, and `MCP_OAUTH_JWKS_URL`. The issuer must issue expiring JWT access tokens whose audience is the exact public `/api/mcp` URL and whose scope includes `workshape:access`. Map each participant's OAuth subject to their Workshape account with `npm run account -- add ... --subject <subject>`. Workshape verifies issuer, audience, expiry, signature, scope, and mapped actor. Local tokens are disabled in this configuration.

Register the public URL with Codex or Claude Code and use their MCP OAuth login flow. Claude's web and Desktop custom remote connectors connect from Anthropic's cloud, so the server must be reachable at a public HTTPS URL on port 443; they cannot reach a laptop's `localhost` server. Add the public `/api/mcp` URL under **Customize → Connectors → Add custom connector**, then sign in with the configured issuer. [Claude remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

Workshape is an MCP resource server, not an OAuth issuer. An organization must configure its own compatible issuer before using OAuth clients. Test the issuer's client registration and callback support with the particular Codex or Claude client before relying on the deployment.
