import fs from "node:fs/promises";
await fs.rm("desktop/dist", { recursive: true, force: true });
await fs.cp("dist", "desktop/dist", { recursive: true });
