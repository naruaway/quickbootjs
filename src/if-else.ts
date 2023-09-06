import {
  types as t,
  traverse,
  parse,
  type Visitor,
  type NodePath,
} from "@babel/core";
import generatorPkg from "@babel/generator";
import {
  assertNever,
  assertNonNull,
  createEvalBlock,
  createGetPos,
  executeInVmAndGetTraceData,
  isEvalBlock,
  isFunctionBlock,
} from "./util.js";
const generate = generatorPkg.default;
import { traceRuntime, type TraceData, loadTrace } from "./trace.js";

// Make sure to always use BlockStatement
export const createIfElseVisitor = (
  mode: { type: "trace" } | { type: "optimize"; traceData: TraceData },
): Visitor => {
  return {
    IfStatement(path) {
      const consequent = path.get("consequent");
      if (!consequent.isBlockStatement()) {
        consequent.replaceWith(t.blockStatement([consequent.node]));
      }
      const alternate = path.get("alternate");
      if (alternate.node && !alternate.isBlockStatement()) {
        alternate.replaceWith(t.blockStatement([alternate.node]));
      }
    },
  };
};
