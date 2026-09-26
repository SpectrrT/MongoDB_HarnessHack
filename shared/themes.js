// Appearance palettes. Community names identify their original color families.
export const THEMES = [
 ['light','Black and white','Offload','#f8f8f8','#ffffff','#171717','#171717','light'],
 ['monochrome-dark','White on black','Offload','#080808','#111111','#f5f5f5','#ffffff','dark'],
 ['codex-light','Codex light','Codex','#f5f5f5','#ffffff','#202020','#0285ff','light'],
 ['codex-dark','Codex dark','Codex','#181818','#212121','#ececec','#60a5fa','dark'],
 ['github-light','GitHub light','Editor palettes','#f6f8fa','#ffffff','#1f2328','#0969da','light'],
 ['github-dark','GitHub dark','Editor palettes','#010409','#0d1117','#e6edf3','#58a6ff','dark'],
 ['tokyo-night','Tokyo Night','Editor palettes','#16161e','#1a1b26','#c0caf5','#7aa2f7','dark'],
 ['one-dark','One Dark','Editor palettes','#21252b','#282c34','#abb2bf','#61afef','dark'],
 ['nord','Nord','Editor palettes','#2e3440','#3b4252','#eceff4','#88c0d0','dark'],
 ['dracula','Dracula','Editor palettes','#21222c','#282a36','#f8f8f2','#bd93f9','dark'],
 ['catppuccin','Catppuccin Mocha','Editor palettes','#181825','#1e1e2e','#cdd6f4','#cba6f7','dark'],
 ['gruvbox','Gruvbox','Editor palettes','#1d2021','#282828','#ebdbb2','#fabd2f','dark'],
 ['solarized-light','Solarized light','Editor palettes','#eee8d5','#fdf6e3','#586e75','#268bd2','light'],
 ['solarized-dark','Solarized dark','Editor palettes','#002b36','#073642','#93a1a1','#2aa198','dark'],
 ['matrix','Matrix','Editor palettes','#020602','#071007','#bcf5b7','#5bf76f','dark'],
 ['claude-light','Claude light','Claude','#f0eee6','#faf9f5','#3d3929','#a34d2e','light'],
 ['claude-dark','Claude dark','Claude','#20201e','#292927','#eeeeea','#d99a7d','dark'],
].map(([id,name,group,bg,surface,ink,accent,mode])=>({id,name,group,bg,surface,ink,accent,mode}));
export const THEME_IDS = [...THEMES.map(t=>t.id),'system','claude-system','custom'];
export function resolveTheme(id, dark, custom) {
 if(id==='system')id=dark?'codex-dark':'codex-light';
 if(id==='claude-system')id=dark?'claude-dark':'claude-light';
 if(id==='custom'&&custom)return {...custom,id:'custom',bg:custom.surface,name:'Imported Codex theme'};
 return THEMES.find(t=>t.id===id)||THEMES[0];
}
export function importCodexTheme(text) {
 const value=JSON.parse(text.trim().replace(/^codex-theme-v1:/,''));
 const c=value.theme,hex=/^#[0-9a-f]{6}$/i;
 if(!c||!['surface','ink','accent'].every(k=>hex.test(c[k]))||!['dark','light'].includes(value.variant))throw Error('Paste a Codex theme with surface, ink and accent colors.');
 return {surface:c.surface,ink:c.ink,accent:c.accent,mode:value.variant};
}
export function themeStyle(t) {
 return {'--off-bg':t.bg,'--off-surface':t.surface,'--off-ink':t.ink,'--off-accent':t.accent,'--off-muted':`color-mix(in srgb, ${t.ink} 64%, ${t.surface})`,'--off-line':`color-mix(in srgb, ${t.ink} 14%, ${t.surface})`,'--off-inset':`color-mix(in srgb, ${t.ink} 4%, ${t.surface})`,colorScheme:t.mode};
}
