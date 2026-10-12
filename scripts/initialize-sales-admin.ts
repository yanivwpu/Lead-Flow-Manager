/** Run only in an authorized operator shell. Password is supplied on stdin, never argv. */
import { initializeSalesAdmin } from "../server/salesAdminBootstrap";

async function main(): Promise<void> {
  if (process.stdin.isTTY) throw new Error("Supply the new password through stdin");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (Buffer.byteLength(input, "utf8") > 74) throw new Error("Password input is too long");
  }
  const password = input.replace(/\r?\n$/, "");
  if (!await initializeSalesAdmin(password)) throw new Error("Sales Admin is already initialized; credentials unchanged");
  console.info("Sales Admin initialized");
}

main().then(() => process.exit(0)).catch(() => {
  console.error("Sales Admin initialization failed; verify input and existing initialization");
  process.exit(1);
});
