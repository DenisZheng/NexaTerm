import type { CSSProperties, ReactNode } from "react";

interface Props {
  ariaLabel:string;visible:boolean;className?:string;style?:CSSProperties;onPaneFocus?:()=>void;
  icon:ReactNode;message:string;description:string;error?:string|null;actions?:ReactNode;
}
/** Shared compact terminal fallback; appearance comes from existing global state-panel tokens. */
export function TerminalStatePanel({ariaLabel,visible,className,style,onPaneFocus,icon,message,description,error,actions}:Props) {
  return <section className={`terminal-direct-status ${visible?"":"is-hidden"} ${className||""}`} aria-label={ariaLabel} aria-hidden={!visible} style={style} onPointerDown={onPaneFocus}>
    <div>{icon}<strong>{message}</strong><span>{description}</span>{error?<small>{error}</small>:null}{actions}</div>
  </section>;
}
