// Tell the Workers test pool that `env` from "cloudflare:test" carries our bindings.
import type { Env } from "../src/types";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}
