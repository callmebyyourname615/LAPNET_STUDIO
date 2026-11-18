import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
for (const project of ["tsconfig.json", "tsconfig.esm.json"]) {
  const result = spawnSync("tsc", ["-p", project], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("Contract compilation failed");
}
writeFileSync("dist/esm/package.json", JSON.stringify({ type: "module" }) + "\n");
