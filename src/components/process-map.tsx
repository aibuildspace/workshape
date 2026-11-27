"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { changeProcessLink } from "../../app/actions";

type Process = { id: string; name: string; ownerName: string; version: number; canEdit: boolean };
type ProcessLink = { sourceId: string; targetId: string };
type ProcessNode = Node<{
  process: Process;
  active: boolean;
  choose: (id: string) => void;
}, "process">;

function MapNode({ data: { process, active, choose } }: NodeProps<ProcessNode>) {
  return <div className={active ? "process-map-node process-map-node-active" : "process-map-node"}>
    <Handle type="target" position={Position.Left} aria-label={`Link to ${process.name}`} />
    <button className="nodrag nopan" type="button" aria-pressed={active} onClick={() => choose(process.id)}>
      {process.name}
    </button>
    <Handle type="source" position={Position.Right} isConnectableStart={process.canEdit}
      className={process.canEdit ? undefined : "process-map-passive-handle"} aria-label={`Link from ${process.name}`} />
  </div>;
}

const nodeTypes = { process: MapNode };

export function ProcessMap({ processes, links, initialSelectedId, canSubmit }: {
  processes: Process[]; links: ProcessLink[]; initialSelectedId?: string; canSubmit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [targetId, setTargetId] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; message: string }>();
  const byId = new Map(processes.map((item) => [item.id, item]));
  const selected = byId.get(selectedId ?? "") ?? processes.find((item) => item.canEdit) ?? processes[0];
  if (!selected) return <div className="empty"><h2>No published processes yet</h2></div>;

  const outgoing = links.filter((link) => link.sourceId === selected.id);
  const incoming = links.filter((link) => link.targetId === selected.id);
  const linked = new Set(outgoing.map((link) => link.targetId));
  const choices = processes.filter((item) => item.id !== selected.id && !linked.has(item.id));
  const canConnect = processes.length > 1 && processes.some((item) => item.canEdit);
  const columns = Math.min(3, Math.ceil(Math.sqrt(processes.length)));
  const canvasHeight = Math.min(495, Math.max(236, Math.ceil(processes.length / columns) * 115 + 88));

  function choose(id: string) {
    if (pending || id === selected.id) return;
    setSelectedId(id);
    setTargetId("");
    setFeedback(undefined);
  }

  const nodes: ProcessNode[] = processes.map((item, index) => ({
    id: item.id, type: "process", data: { process: item, active: item.id === selected.id, choose },
    position: { x: (index % columns) * 236, y: Math.floor(index / columns) * 115 },
  }));
  const edges: Edge[] = links.map((link) => {
    const highlighted = link.sourceId === selected.id || link.targetId === selected.id;
    const color = highlighted ? "#006a5e" : "#829993";
    return {
      id: link.sourceId + ":" + link.targetId, source: link.sourceId, target: link.targetId,
      ariaLabel: `${byId.get(link.sourceId)?.name} followed by ${byId.get(link.targetId)?.name}`,
      type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color },
      style: { stroke: color, strokeWidth: highlighted ? 2 : 1.5 },
    };
  });

  function update(source: string, target: string, operation: "link" | "unlink") {
    if (pending || !target) return;
    setFeedback(undefined);
    startTransition(async () => {
      try {
        const result = await changeProcessLink({ sourceId: source, targetId: target, operation });
        if (result.error) {
          setFeedback({ kind: "error", message: result.error });
          return;
        }
        setSelectedId(source);
        setTargetId("");
        const message = operation === "link"
          ? result.changed ? "Link added." : "These processes are already linked."
          : "Link removed.";
        setFeedback({ kind: "success", message });
        router.refresh();
      } catch {
        setFeedback({ kind: "error", message: "Could not update the link. Try again." });
      }
    });
  }

  function connect(connection: Connection) {
    update(connection.source, connection.target, "link");
  }

  return <div className="process-map">
    <div className="process-map-stage">
      <div className="process-map-canvas" role="region" aria-label="Process diagram" style={{ height: canvasHeight }}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.2}
          fitViewOptions={{ padding: "20px", maxZoom: 1 }} nodesDraggable={false} nodesConnectable={canConnect && !pending}
          elementsSelectable={false} nodesFocusable={false} edgesFocusable={false} deleteKeyCode={null} zoomOnScroll={false} preventScrolling={false}
          isValidConnection={(item) => item.source !== item.target && Boolean(byId.get(item.source)?.canEdit)}
          onConnect={connect}>
          <Background gap={20} color="#d5e0dd" size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {canConnect && <p className="process-map-hint">Drag from an outgoing handle to link processes.</p>}
    </div>
    <aside className="process-inspector" aria-label="Selected process">
      <label className="sr-only" htmlFor="map-process">Select process</label>
      <select id="map-process" value={selected.id} disabled={pending} onChange={(event) => choose(event.target.value)}>
        {processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <p className="process-meta">{selected.ownerName} · Version {selected.version}</p>
      <div className="process-row-actions">
        <Link className="button button-secondary" href={`/processes/${selected.id}/request`}>{canSubmit ? "Start request" : "View form"}</Link>
        {selected.canEdit && <Link className="button button-text" href={`/processes/${selected.id}/edit`}>Edit</Link>}
      </div>

      <section className="process-connections" aria-labelledby="next-processes-heading">
        <h2 id="next-processes-heading">Suggested after approval</h2>
        {outgoing.length ? <ul>{outgoing.map(({ targetId: target }) => <li key={target}>
          <button type="button" className="process-related" onClick={() => choose(target)} disabled={pending}>{byId.get(target)?.name}</button>
          {selected.canEdit && <button type="button" className="button button-text" disabled={pending}
            onClick={() => update(selected.id, target, "unlink")} aria-label={`Remove link to ${byId.get(target)?.name}`}>Remove</button>}
        </li>)}</ul> : <p className="muted">{selected.canEdit && processes.length === 1 ? "Publish a second process to add a link." : "No next process linked."}</p>}
        {selected.canEdit && choices.length > 0 && <form className="process-link-form" onSubmit={(event) => {
          event.preventDefault();
          update(selected.id, targetId, "link");
        }}>
          <label className="sr-only" htmlFor="map-next-process">Next process</label>
          <select id="map-next-process" value={targetId} required disabled={pending} onChange={(event) => setTargetId(event.target.value)}>
            <option value="">Choose next process</option>
            {choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="button button-secondary" disabled={pending || !targetId}>Add link</button>
        </form>}
        {feedback && <p className={`process-map-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p>}
      </section>

      {incoming.length > 0 && <section className="process-connections" aria-labelledby="previous-processes-heading">
        <h2 id="previous-processes-heading">Suggested by</h2>
        <ul>{incoming.map(({ sourceId: source }) => <li key={source}>
          <button type="button" className="process-related" onClick={() => choose(source)} disabled={pending}>{byId.get(source)?.name}</button>
        </li>)}</ul>
      </section>}
    </aside>
  </div>;
}
