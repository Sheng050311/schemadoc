"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ConceptualNode } from "@/lib/conceptual-graph";

const handleStyle = { opacity: 0 };

export const EntityNode = memo(function EntityNode({ data, selected }: NodeProps<ConceptualNode>) {
  return <div className={`flex h-full w-full items-center justify-center border-2 border-indigo-600 bg-indigo-50 px-3 font-mono text-sm font-semibold text-indigo-950 ${selected ? "ring-2 ring-indigo-300" : ""}`}>
    <Handle id="in" type="target" position={Position.Left} style={handleStyle} />
    {data.label}
    <Handle id="out" type="source" position={Position.Right} style={handleStyle} />
    <Handle id="attributes" type="source" position={Position.Bottom} style={handleStyle} />
  </div>;
});

export const AttributeNode = memo(function AttributeNode({ data, selected }: NodeProps<ConceptualNode>) {
  return <div title={data.primaryKey ? `${data.label} (primary key)` : data.label} className={`flex h-full w-full items-center justify-center rounded-[50%] border bg-white px-4 font-mono text-sm text-slate-800 ${data.primaryKey ? "border-indigo-500 font-semibold underline underline-offset-4" : "border-slate-400"} ${selected ? "ring-2 ring-indigo-300" : ""}`}>
    <Handle id="in" type="target" position={Position.Top} style={handleStyle} />
    {data.label}
  </div>;
});

export const RelationshipNode = memo(function RelationshipNode({ data, selected }: NodeProps<ConceptualNode>) {
  return <div title={data.description} className="relative flex h-full w-full items-center justify-center font-mono text-xs text-amber-950">
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 160 100" aria-hidden="true"><polygon points="80,2 158,50 80,98 2,50" fill="#fffbeb" stroke={selected ? "#4f46e5" : "#b45309"} strokeWidth="2" /></svg>
    <Handle id="in" type="target" position={Position.Left} style={handleStyle} />
    <span className="relative">{data.label}</span>
    <Handle id="out" type="source" position={Position.Right} style={handleStyle} />
  </div>;
});
