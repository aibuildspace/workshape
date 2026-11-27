# Workshape

Workshape lets an HR team define a request process, publish an intake form, and resolve requests with a recorded decision history. See the [product purpose](docs/product-purpose.md) and [technology review](docs/technology-review.md).

## Run locally

Use Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Open [Workshape at localhost](http://127.0.0.1:3000). The app starts with an empty database at `data/workshape.sqlite`. Set `WORKSHAPE_DB` to use a different file. The server keeps `OPENAI_API_KEY` in the environment and uses `gpt-4.1-mini` by default. Set `OPENAI_MODEL` to select another model that supports structured output. On managed networks that trust a private certificate authority in the system store, run `NODE_USE_SYSTEM_CA=1 npm run dev`.

### Open the local pilot without passwords

```sh
npm run seed:pilot
WORKSHAPE_LOCAL_PILOT=1 npm run dev
```

Open **Open as pilot admin**. Use **Seeded profile** to switch to Alex Morgan (employee), Jordan Lee (manager), Sam Patel (HR reviewer), or Taylor Reed (another employee). Select **Return to pilot admin** before choosing a different profile. The profiles use the same database and role permissions as regular accounts. Seeding can be rerun and keeps existing pilot accounts and records.

The launcher is enabled only in development on a loopback host with no public URL configured. Keep the server bound to loopback when using it. The seeded admin uses the HR function-owner role.

### Provision individual accounts

Create an account for each participant with `npm run account -- add`. Supply the password on standard input. In the interactive example below, type at least 12 characters, press Enter, and then send EOF with Ctrl+D. `stty` hides password input.

```sh
stty -echo
npm run --silent account -- add --email "$PILOT_OWNER_EMAIL" --name "$PILOT_OWNER_NAME" --role function_owner
stty echo
```

Use `manager`, `hr`, or `employee` for the other roles. Create the manager before the employee and pass `--manager "$PILOT_MANAGER_EMAIL"` when provisioning the employee. An assigned manager is required to submit a case. Sign in as the HR function owner and open **Processes → New process**. Draft with AI or add fields manually, then preview and publish.

The pilot starts every request with the employee’s manager. An optional exception rule sends approved requests to an assigned HR reviewer based on the answer to a required dropdown. A reviewer can approve, decline, or return the case for more information.

## MCP

Connect to `/api/mcp` over Streamable HTTP. The tools list published processes, describe an intake form, submit a request, and check accessible case status. A `submit_request` retry must reuse the original UUID in `requestKey`.

For local testing, start the app with `WORKSHAPE_ALLOW_LOCAL_MCP_TOKENS=1`, then issue an eight-hour bearer token for an existing participant:

```sh
npm run --silent account -- token --email "$PILOT_EMPLOYEE_EMAIL"
```

Send the token in the MCP client's `Authorization: Bearer` header. For remote MCP, configure a HTTPS deployment with a persistent volume and set `WORKSHAPE_PUBLIC_URL`, `MCP_OAUTH_ISSUER`, and `MCP_OAUTH_JWKS_URL`. Configure the issuer to issue JWT access tokens for the published `/api/mcp` URL with the `workshape:access` scope. When provisioning users, pass their matching OAuth subject with `--subject`. Remote configuration disables local tokens.

## Verify

```sh
npm run test
npm run build
```

## License

Workshape is released under the [MIT License](LICENSE).
