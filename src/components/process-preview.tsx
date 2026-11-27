"use client";

import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ruleLabel, type Draft } from "@/lib/process";

type Step = Node<{ label: string; owner: string; tone: "default" | "active" | "complete"; last?: boolean }, "step">;
const nodeTypes = { step: ProcessStep };

function ProcessStep({ data }: NodeProps<Step>) {
  return <div className={`flow-step flow-${data.tone}`}>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <strong>{data.label}</strong><span>{data.owner}</span>
    {!data.last && <Handle type="source" position={Position.Bottom} isConnectable={false} />}
  </div>;
}

export function ProcessPreview({ draft, hrName }: { draft: Draft; hrName: string }) {
  const hr = Boolean(draft.escalation);
  const nodes: Step[] = [
    { id: "submit", type: "step", position: { x: 115, y: 12 }, data: { label: "Submit request", owner: "Employee", tone: "default" } },
    { id: "manager", type: "step", position: { x: 115, y: 100 }, data: { label: "Manager review", owner: "Assigned manager", tone: "active" } },
    { id: "complete", type: "step", position: { x: 115, y: hr ? 300 : 195 }, data: { label: "Decision recorded", owner: "Case history", tone: "complete", last: true } },
  ];
  const edges: Edge[] = [
    { id: "submit-manager", source: "submit", target: "manager", type: "smoothstep" },
    { id: "manager-end", source: "manager", target: "complete", type: "smoothstep", label: hr ? "Routine or declined" : undefined },
  ];
  if (hr) {
    nodes.push({ id: "hr", type: "step", position: { x: 310, y: 200 }, data: { label: "HR review", owner: hrName || "Reviewer to be assigned", tone: "active" } });
    edges.push({ id: "manager-hr", source: "manager", target: "hr", type: "smoothstep", label: "Approved exception" },
      { id: "hr-end", source: "hr", target: "complete", type: "smoothstep" });
  }
  return <>
    <div className="flow-canvas" aria-hidden="true">
      <ReactFlow key={hr ? "escalated" : "routine"} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} nodesFocusable={false} edgesFocusable={false}
        zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} panOnDrag={false} preventScrolling={false}>
        <Background color="#cbd9d7" gap={19} size={1} />
      </ReactFlow>
    </div>
    <ol className="preview-steps">
      <li>Employee submits the request.</li>
      <li>The assigned manager reviews it.</li>
      {hr ? <li>If approved and <strong>{ruleLabel(draft)}</strong>, send the request to {hrName || "the assigned HR reviewer"}.</li> :
        <li>The manager makes the final decision.</li>}
      <li>The final decision is recorded in the case history.</li>
    </ol>
    <p className="preview-note">Reviewers can return a request to the employee for more information.</p>
  </>;
}
