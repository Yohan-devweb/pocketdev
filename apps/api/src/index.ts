import { Hono } from "hono";
import type { Env } from "./env";

export { WorkspaceContainer } from "./runner/cloudflare";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true, service: "pocketdev-api" }));

export default app;
