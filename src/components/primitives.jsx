import React from 'react';
// Application adapters for the unpublished supporting atoms referenced by Beautiful UI.
// The gallery components themselves are retained from their published source.
export function Button({children,variant,icon,loading,className='',...props}){return <button className={`primitive-button ${variant||''} ${className}`} {...props}>{icon}{children}</button>}
export function EntityChip({name,children}){return <span className="entity-chip">{name||children}</span>}
export function ValuePill({children}){return <span className="value-pill">{children}</span>}
export function Shimmer({children,className=''}){return <span className={className}>{children}</span>}
export function StreamText({text,children}){return <span>{text||children}</span>}
export default function GlideMenu({children,className='',...props}){return <div className={className}>{children}</div>}
