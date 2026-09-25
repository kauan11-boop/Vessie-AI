import React from "react";

function Node({ node, depth, activePath, onSelectFile }) {
  const pad = { paddingLeft: 8 + depth * 14 };
  if (node.kind === "directory") {
    return (
      <>
        {depth > 0 && (
          <div className="tree-node" style={pad}>
            📁 {node.name}
          </div>
        )}
        {node.children.map((c) => (
          <Node
            key={c.path}
            node={c}
            depth={depth + 1}
            activePath={activePath}
            onSelectFile={onSelectFile}
          />
        ))}
      </>
    );
  }
  return (
    <div
      className={`tree-node file ${activePath === node.path ? "active-file" : ""}`}
      style={pad}
      onClick={() => onSelectFile(node.path)}
      title={node.path}
    >
      📄 {node.name}
    </div>
  );
}

export default function FileTree({ tree, activePath, onSelectFile }) {
  if (!tree) return null;
  return (
    <div className="files-tree">
      <Node node={tree} depth={0} activePath={activePath} onSelectFile={onSelectFile} />
    </div>
  );
}
