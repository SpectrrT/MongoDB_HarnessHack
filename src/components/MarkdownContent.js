import React from 'react';
import Markdown,{defaultUrlTransform} from 'react-markdown';
import {ResponseLink} from './ArtifactLink.js';
import remarkGfm from 'remark-gfm';
import {normalizeMath} from '../../shared/normalize-math.js';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';

const h=React.createElement;
const components={
  table:({children})=>h('div',{className:'response-table-scroll',role:'region','aria-label':'Response table',tabIndex:0},h('table',null,children)),
  th:({children,style})=>h('th',{scope:'col',style},children),
  a:ResponseLink,
  // Untrusted remote image URLs should not make requests just by rendering an answer.
  img:({src,alt})=>src?h('a',{href:src,target:'_blank',rel:'noopener noreferrer'},alt||'Open image'):null,
};
// Preserve prose prices such as “$10 and $20” that otherwise resemble dollar-delimited math.
function remarkCurrency(){return tree=>{
 const visit=node=>{for(const child of node.children||[]){if(child.type==='inlineMath'&&/^\d[\d,.]*(?:\s+(?:and|or|to)\s*|\s*[-–]\s*)$/.test(child.value)){child.type='text';child.value='$'+child.value+'$';delete child.data;}else visit(child);}};visit(tree);
};}
export default React.memo(function MarkdownContent({text=''}){
  return h('div',{className:'response-markdown'},h(Markdown,{remarkPlugins:[remarkGfm,remarkMath,remarkCurrency],rehypePlugins:[[rehypeKatex,{trust:false,strict:'ignore',maxSize:20,maxExpand:1000}],[rehypeHighlight,{detect:false,ignoreMissing:true}]],components,urlTransform:url=>/^(?:file:|sandbox:)/i.test(url)?url:defaultUrlTransform(url),skipHtml:true},normalizeMath(text)));
});
