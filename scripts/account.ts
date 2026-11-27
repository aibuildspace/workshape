import { parseArgs } from "node:util";
import { accountByEmail, createAccount, issueMcpToken, roles } from "../src/lib/accounts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
    manager: { type: "string" },
    subject: { type: "string" },
  },
});

try {
  const [command] = positionals;
  const { email, name, role, manager, subject } = values;
  if (command === "add" && email && name && roles.some((item) => item === role)) {
    const password = (await Array.fromAsync(process.stdin)).join("").trimEnd();
    createAccount({ email, name, role: role as (typeof roles)[number], password, managerEmail: manager, oauthSubject: subject });
    console.log("Created " + email);
  } else if (command === "token" && email) {
    const user = accountByEmail(email);
    if (!user) throw new Error("Account not found.");
    console.log(issueMcpToken(user.id));
  } else {
    throw new Error("Use add --email <email> --name <name> --role <role> with a password on stdin, or token --email <email>.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Account command failed.");
  process.exitCode = 1;
}
