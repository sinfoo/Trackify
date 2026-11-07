import { Handle, Position } from "@xyflow/react";

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;
const hidden = { opacity: 0, pointerEvents: "none" as const, minWidth: 0, minHeight: 0, width: 1, height: 1, border: 0 };

/** Invisible source + target handle on every side, ids `s-<side>` / `t-<side>`. */
export function SideHandles() {
  return (
    <>
      {SIDES.map((p) => (
        <Handle key={`s-${p}`} id={`s-${p}`} type="source" position={p} style={hidden} isConnectable={false} />
      ))}
      {SIDES.map((p) => (
        <Handle key={`t-${p}`} id={`t-${p}`} type="target" position={p} style={hidden} isConnectable={false} />
      ))}
    </>
  );
}

type XY = { x: number; y: number };

/** Pick facing sides so arrowheads land on node borders. `loop` routes a return edge under both nodes. */
export function pickHandles(a: XY, b: XY, loop = false) {
  if (loop) return { sourceHandle: `s-${Position.Bottom}`, targetHandle: `t-${Position.Bottom}` };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) * 0.6 > Math.abs(dy)) {
    return dx > 0
      ? { sourceHandle: `s-${Position.Right}`, targetHandle: `t-${Position.Left}` }
      : { sourceHandle: `s-${Position.Left}`, targetHandle: `t-${Position.Right}` };
  }
  return dy > 0
    ? { sourceHandle: `s-${Position.Bottom}`, targetHandle: `t-${Position.Top}` }
    : { sourceHandle: `s-${Position.Top}`, targetHandle: `t-${Position.Bottom}` };
}
