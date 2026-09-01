import { Fragment, type ReactNode } from "react";

/**
 * Fill `{name}` placeholders in a localised template with React nodes.
 *
 * Needed because some strings emphasise their values — the safety sheet sets
 * the observed angle and the cap in mono, which is a real design detail and
 * not decoration. Concatenating them into one flat string would lose that,
 * and hardcoding the order in JSX would break any language that puts the
 * numbers elsewhere in the sentence. Hindi does exactly that.
 *
 * Keeping the templates as plain strings also keeps `ui.ts` free of React,
 * so the string table stays readable and testable on its own.
 */
export function interpolate(template: string, values: Record<string, ReactNode>): ReactNode {
  const parts = template.split(/(\{[a-zA-Z]+\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = /^\{([a-zA-Z]+)\}$/.exec(part);
        const key = match?.[1];
        // An unknown placeholder renders literally rather than disappearing:
        // a visible "{limit}" is a bug report, a silent gap is not.
        if (key && key in values) return <Fragment key={i}>{values[key]}</Fragment>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
