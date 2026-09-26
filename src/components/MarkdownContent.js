import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const h=React.createElement;
const components={
  table:({children})=>h('div',{className:'response-table-scroll',role:'region','aria-label':'Response table',tabIndex:0},h('table',null,children)),
  th:({children,style})=>h('th',{scope:'col',style},children),
  a:({href,children,title})=>href?h('a',{href,title,target:'_blank',rel:'noopener noreferrer'},children):h('span',null,children),
  // Untrusted remote image URLs should not make requests just by rendering an answer.
  img:({src,alt})=>src?h('a',{href:src,target:'_blank',rel:'noopener noreferrer'},alt||'Open image'):null,
};
export default function MarkdownContent({text=''}){
  return h('div',{className:'response-markdown'},h(Markdown,{remarkPlugins:[remarkGfm],components,skipHtml:true},text));
}
