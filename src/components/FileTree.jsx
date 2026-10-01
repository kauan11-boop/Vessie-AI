import React, { useState } from "react";

function Node({ node, depth, activePath, onSelectFile }) {
  const [expanded, setExpanded] = useState(true);
  const paddingLeft = 10 + depth * 13;

  if (node.kind === "directory") {
    return (
      <>
        {depth > 0 && (
          <button
            className="tree-node directory-node"
            style={{ paddingLeft }}
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
          >
            <span className="tree-caret" aria-hidden="true">{expanded ? "⌄" : "›"}</span>
            <span className="tree-folder" aria-hidden="true">▰</span>
            <span>{node.name}</span>
          </button>
        )}
        {(depth === 0 || expanded) && node.children.map((child) => (
          <Node
            key={child.path}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            onSelectFile={onSelectFile}
          />
        ))}
      </>
    );
  }

  return (
    <button
      className={`tree-node file ${activePath === node.path ? "active-file" : ""}`}
      style={{ paddingLeft }}
      onClick={() => onSelectFile(node.path)}
      title={node.path}
    >
      <span className="tree-file-mark" aria-hidden="true">·</span>
      <span>{node.name}</span>
    </button>
  );
}

export default function FileTree({ tree, activePath, onSelectFile }) {
  if (!tree) {
    return <div className="files-tree empty-tree">A árvore do projeto aparecerá aqui.</div>;
  }
  return (
    <div className="files-tree" aria-label="Arquivos do projeto">
      <Node node={tree} depth={0} activePath={activePath} onSelectFile={onSelectFile} />
    </div>
  );
}
