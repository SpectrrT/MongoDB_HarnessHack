import fs from 'node:fs/promises';
import {transform} from 'esbuild';
await fs.mkdir('src/vendor/beautiful',{recursive:true});await fs.mkdir('src/vendor/evilcharts/ui',{recursive:true});
for(const file of await fs.readdir('vendor/beautiful-ui')){
 if(!file.endsWith('.tsx'))continue;
 let source=await fs.readFile('vendor/beautiful-ui/'+file,'utf8');
 source=source.replace(/from "@\/components\/(?:atoms|primitives)\/[^\"]+"/g,'from "../../components/primitives"');
 source=source.replace(/import (\w+) from "@central-icons-react\/[^\"]+";/g,'import { Circle as $1 } from "lucide-react";');
 const icons={IconArrowBoxLeft:'LogOut',IconCheckmark1Small:'Check',IconChevronDownSmall:'ChevronDown',IconCrossSmall:'X',IconEditBig:'Pencil',IconHome:'Home',IconMagnifyingGlass:'Search',IconPlusMedium:'Plus',IconPopsicle2:'IceCream',IconSettingsGear1:'Settings',IconSidebarLeftArrow:'PanelLeft',IconUserAdd:'UserPlus'};
 source=source.replace(/import \{ (\w+) \} from "@central-icons-react\/[^\"]+";/g,(_,name)=>`import { ${icons[name]||'Circle'} as ${name} } from "lucide-react";`);
 if(file==='PromptBar.tsx') source=source.replace('plusOpen ? "at" : token?.kind ?? null','demo ? (plusOpen ? "at" : token?.kind ?? null) : null');
 const code=await transform(source,{loader:'tsx',jsx:'automatic',format:'esm',target:'es2022'});
 await fs.writeFile('src/vendor/beautiful/'+file.replace('.tsx','.jsx'),'// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.\n'+code.code);
}
for(const name of ['echarts-chart','echarts-tooltip','echarts-brush','echarts-legend','echarts-dot']){
 let s=await fs.readFile(`vendor/evilcharts/registry/ui/${name}.tsx`,'utf8');s=s.replaceAll('@/registry/ui/','./');await fs.writeFile(`src/vendor/evilcharts/ui/${name}.jsx`,(await transform(s,{loader:'tsx',jsx:'automatic',format:'esm'})).code);
}
let bar=await fs.readFile('vendor/evilcharts/registry/charts/echarts-bar-chart.tsx','utf8');bar=bar.replaceAll('@/registry/ui/','./ui/');await fs.writeFile('src/vendor/evilcharts/bar.jsx',(await transform(bar,{loader:'tsx',jsx:'automatic',format:'esm'})).code);
