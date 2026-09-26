import fs from "node:fs/promises";
import { transform } from "esbuild";
await fs.mkdir("src/vendor/beautiful", { recursive: true });
await fs.mkdir("src/vendor/evilcharts/ui", { recursive: true });
for (const file of await fs.readdir("vendor/beautiful-ui")) {
  if (!file.endsWith(".tsx")) continue;
  let source = await fs.readFile("vendor/beautiful-ui/" + file, "utf8");
  source = source.replace(
    /from "@\/components\/(?:atoms|primitives)\/[^\"]+"/g,
    'from "../../components/primitives"',
  );
  source = source.replace(
    /import (\w+) from "@central-icons-react\/[^\"]+";/g,
    'import { Circle as $1 } from "lucide-react";',
  );
  const icons = {
    IconArrowBoxLeft: "LogOut",
    IconCheckmark1Small: "Check",
    IconChevronDownSmall: "ChevronDown",
    IconCrossSmall: "X",
    IconEditBig: "Pencil",
    IconHome: "Home",
    IconMagnifyingGlass: "Search",
    IconPlusMedium: "Plus",
    IconPopsicle2: "IceCream",
    IconSettingsGear1: "Settings",
    IconSidebarLeftArrow: "PanelLeft",
    IconUserAdd: "UserPlus",
  };
  source = source.replace(
    /import \{ (\w+) \} from "@central-icons-react\/[^\"]+";/g,
    (_, name) =>
      `import { ${icons[name] || "Circle"} as ${name} } from "lucide-react";`,
  );
  if (file === "PromptBar.tsx")
    source = source.replace(
      'plusOpen ? "at" : token?.kind ?? null',
      'local ? (plusOpen ? "at" : token?.kind ?? null) : null',
    );
  // Upstream rows that are neither done nor running play a gallery local sequence
  // (pending → failed → done). Checkpointed runs need static "idle" and "paused" steps.
  if (file === "TaskRows.tsx") {
    source = source.replace(
      'if (row.status === "running") return <SpinnerRing active>{row.step}</SpinnerRing>;',
      'if (row.status === "running") return <SpinnerRing active>{row.step}</SpinnerRing>;\n' +
        '    if (row.status === "idle") return <SpinnerRing>{row.step}</SpinnerRing>;\n' +
        '    if (row.status === "paused") return <Badge tone="red"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg></Badge>;',
    );
    source = source.replace(
      'if (row.status === "running") return null;',
      'if (row.status === "running" || row.status === "idle") return null;\n' +
        '    if (row.status === "paused") return <span className="inline-flex h-5.5 items-center rounded-full bg-red-tint px-2 text-[11.5px] font-medium text-red">{copy.paused ?? "Paused"}</span>;',
    );
  }
  const code = await transform(source, {
    loader: "tsx",
    jsx: "automatic",
    format: "esm",
    target: "es2022",
  });
  await fs.writeFile(
    "src/vendor/beautiful/" + file.replace(".tsx", ".jsx"),
    "// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.\n" +
      code.code,
  );
}
for (const name of [
  "echarts-chart",
  "echarts-tooltip",
  "echarts-brush",
  "echarts-legend",
  "echarts-dot",
]) {
  let s = await fs.readFile(
    `vendor/evilcharts/registry/ui/${name}.tsx`,
    "utf8",
  );
  s = s.replaceAll("@/registry/ui/", "./");
  await fs.writeFile(
    `src/vendor/evilcharts/ui/${name}.jsx`,
    (await transform(s, { loader: "tsx", jsx: "automatic", format: "esm" }))
      .code,
  );
}
let bar = await fs.readFile(
  "vendor/evilcharts/registry/charts/echarts-bar-chart.tsx",
  "utf8",
);
bar = bar.replaceAll("@/registry/ui/", "./ui/");
await fs.writeFile(
  "src/vendor/evilcharts/bar.jsx",
  (await transform(bar, { loader: "tsx", jsx: "automatic", format: "esm" }))
    .code,
);
