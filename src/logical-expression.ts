import { type Visitor, types as t } from "@babel/core";
import {
  assertNever,
  assertNonNull,
  createEvalBlock,
  createEvalExpression,
  createGetPos,
  executeInVmAndGetTraceData,
  genCode,
  transformCodeUsingVisitor,
} from "./util.js";
import { traceRuntime, type TraceData, loadTrace } from "./trace.js";

export const createLogicalExpressionVisitor = (
  mode: { type: "trace" } | { type: "optimize"; traceData: TraceData },
): Visitor => {
  return {
    LogicalExpression(originalPath) {
      const getLogicalExpressionPos = createGetPos("LogicalExpression");
      const operator = originalPath.node.operator;
      if (operator !== "&&" && operator !== "||") return;
      const rightPath = originalPath.get("right");
      const rightPos = assertNonNull(getLogicalExpressionPos(rightPath.node));

      if (mode.type === "trace") {
        rightPath.replaceWith(
          t.sequenceExpression([
            traceRuntime.traceExpression(rightPos),
            rightPath.node,
          ]),
        );
      } else if (mode.type === "optimize") {
        const trace = loadTrace(mode.traceData);
        if (!trace.isExecuted(rightPos)) {
          rightPath.replaceWith(createEvalExpression(rightPath.node));
        }
      } else {
        assertNever(mode);
      }
    },
  };
};

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  test("logical expression", () => {
    const code = `true && false && third && fourth`;
    const traceData = executeInVmAndGetTraceData(
      transformCodeUsingVisitor(
        code,
        createLogicalExpressionVisitor({ type: "trace" }),
      ),
    );

    const optimized = transformCodeUsingVisitor(
      code,
      createLogicalExpressionVisitor({ type: "optimize", traceData }),
    );

    expect(optimized).toMatchInlineSnapshot(
      '"true && false && (\\"$QBJS_evalExp\\", third) && (\\"$QBJS_evalExp\\", fourth);"',
    );
  });
}
