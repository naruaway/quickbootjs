import { type Visitor, types as t } from "@babel/core";
import {
  assertNever,
  assertNonNull,
  createEvalExpression,
  createGetPos,
  executeInVmAndGetTraceData,
  transformCodeUsingVisitor,
} from "./util.js";
import { traceRuntime, type TraceData, loadTrace } from "./trace.js";

export const createConditionalExpressionVisitor = (
  mode: { type: "trace" } | { type: "optimize"; traceData: TraceData },
): Visitor => {
  return {
    ConditionalExpression(originalPath) {
      const getConditionalExpressionPos = createGetPos("ConditionalExpression");

      for (const branch of ["consequent", "alternate"] as const) {
        const path = originalPath.get(branch);
        const pos = assertNonNull(getConditionalExpressionPos(path.node));

        if (mode.type === "trace") {
          path.replaceWith(
            t.sequenceExpression([
              traceRuntime.traceExpression(pos),
              path.node,
            ]),
          );
        } else if (mode.type === "optimize") {
          const trace = loadTrace(mode.traceData);

          if (!trace.isExecuted(pos)) {
            path.replaceWith(createEvalExpression(path.node));
          }
        } else {
          assertNever(mode);
        }
      }
    },
  };
};

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  test("logical expression", () => {
    const optimize = (code: string) => {
      const traceData = executeInVmAndGetTraceData(
        transformCodeUsingVisitor(
          code,
          createConditionalExpressionVisitor({ type: "trace" }),
        ),
      );

      return transformCodeUsingVisitor(
        code,
        createConditionalExpressionVisitor({ type: "optimize", traceData }),
      );
    };

    expect(optimize(`true ? 'TRUE' : 'FALSE'`)).toMatchInlineSnapshot(
      "\"true ? 'TRUE' : (\\\"$QBJS_evalExp\\\", 'FALSE');\"",
    );

    expect(optimize(`false ? 'TRUE' : 'FALSE'`)).toMatchInlineSnapshot(
      "\"false ? (\\\"$QBJS_evalExp\\\", 'TRUE') : 'FALSE';\"",
    );
  });
}
