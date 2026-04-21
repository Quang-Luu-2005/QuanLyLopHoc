import { createRequire } from "node:module";
import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";

if (!process.env.DATABASE_URL && env && env.HYPERDRIVE && env.HYPERDRIVE.connectionString) {
  process.env.DATABASE_URL = String(env.HYPERDRIVE.connectionString);
}

const require = createRequire(import.meta.url);
const app = require("./app");

const port = Number(process.env.PORT || 3000);
app.listen(port);

export default httpServerHandler({ port });
