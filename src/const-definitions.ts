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
  genCode,
  isEvalBlock,
  isFunctionBlock,
  isPureExpression,
  parseExpression,
} from "./util.js";
const generate = generatorPkg.default;
import { traceRuntime, type TraceData, loadTrace } from "./trace.js";

const isObject = (x: unknown): x is object => {
  return x != null && typeof x === "object";
};

export const createConstDefinitionsVisitor = (
  mode: { type: "trace" } | { type: "optimize"; traceData: TraceData },
): Visitor => {
  const getConstDefPos = createGetPos("ConstDef");
  return {
    Expression(path) {
      const pos = getConstDefPos(path.node);
      if (!pos) return;
      const { confident, value } = path.evaluate();
      if (confident) {
        if (
          isPureExpression(path.node) &&
          isObject(value) &&
          /*not intereted in too small const defs*/ JSON.stringify(value)
            .length > 10
        ) {
          // since we know the actual value, there is no reason to check deeper nodes for anything
          path.skip();
          if (mode.type === "trace") {
            path.replaceWith(traceRuntime.traceConstExpression(path.node, pos));
          } else if (mode.type === "optimize") {
            const trace = loadTrace(mode.traceData);
            if (!trace.isExecuted(pos)) {
              // TODO: implement proxy for "optimize phase"
              //path.replaceWith(t.stringLiteral("ObjOrArrayProxy"))
            }
          } else {
            assertNever(mode);
          }
        }
      }
    },
  };
};
