import { type Visitor, types as t } from "@babel/core";
import {
  assertNonNull,
  evalExpression,
  genCode,
  isEvalCall,
  parseEvalExpression,
  transformCodeUsingVisitor,
} from "./util.js";
import { QUICKBOOTJS_VERBOSE_LOG } from "./env.js";

const mergeEvalNodes = (
  operator: "&&" | "||",
  nodes: t.Node[],
): t.Expression => {
  return evalExpression(
    nodes
      .map((n) => assertNonNull(parseEvalExpression(n)))
      .map((e) => `(${e.code})`)
      .join(operator),
  );
};

const createLogicalExpression = (
  operator: "&&" | "||",
  nodes: t.Expression[],
): t.Expression | undefined => {
  if (nodes.length === 0) return undefined;
  const [first, ...remaining] = nodes;
  const children = createLogicalExpression(operator, remaining);
  return children === undefined
    ? first
    : t.logicalExpression(operator, first, children);
};

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  test("createLogicalExpression", () => {
    const n = t.numericLiteral;
    expect(createLogicalExpression("&&", [])).toMatchInlineSnapshot(
      "undefined",
    );
    expect(
      genCode(assertNonNull(createLogicalExpression("&&", [n(0)]))),
    ).toMatchInlineSnapshot('"0"');

    expect(
      genCode(assertNonNull(createLogicalExpression("&&", [n(0), n(1)]))),
    ).toMatchInlineSnapshot('"0 && 1"');

    expect(
      genCode(assertNonNull(createLogicalExpression("&&", [n(0), n(1), n(2)]))),
    ).toMatchInlineSnapshot('"0 && 1 && 2"');

    expect(
      genCode(
        assertNonNull(createLogicalExpression("&&", [n(0), n(1), n(2), n(3)])),
      ),
    ).toMatchInlineSnapshot('"0 && 1 && 2 && 3"');
  });
}

export const createFusionVisitor = (): Visitor => {
  const flattendNodeSet = new Set<t.Node>();
  return {
    LogicalExpression(originalPath) {
      if (!originalPath.node.loc) return;
      const operator = originalPath.node.operator;
      if (operator !== "&&" && operator !== "||") return;
      if (flattendNodeSet.has(originalPath.node.right)) {
        return;
      }

      const flattenHomogeneousChainedLogicalOp = (
        logicalOp: t.Expression,
      ): t.Expression[] => {
        if (
          logicalOp.type !== "LogicalExpression" ||
          logicalOp.operator !== operator
        ) {
          return [logicalOp];
        }
        return [
          ...flattenHomogeneousChainedLogicalOp(logicalOp.left),
          logicalOp.right,
        ];
      };
      // Note that the leftmost node might not have had tracer!
      const flattendNodes = flattenHomogeneousChainedLogicalOp(
        originalPath.node,
      );

      flattendNodes.forEach((node) => {
        flattendNodeSet.add(node);
      });

      const index = flattendNodes.findIndex((node) => isEvalCall(node));
      if (index === -1) return;
      if (index === 0) throw new Error("the first expression was eval");

      const evalNodes = flattendNodes.slice(index);
      if (QUICKBOOTJS_VERBOSE_LOG) {
        if (evalNodes.length > 1) {
          console.log("fusion", evalNodes.length);
        }
      }
      const head = flattendNodes.slice(0, index);
      const tail = mergeEvalNodes(operator, evalNodes);

      originalPath.replaceWith(
        assertNonNull(createLogicalExpression(operator, [...head, tail])),
      );
    },
  };
};

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  test("logical expression", () => {
    const e = (s: string) => genCode(evalExpression(s));
    expect(
      transformCodeUsingVisitor(
        `false && ${e("hello")} && ${e("world")}`,
        createFusionVisitor(),
      ),
    ).toMatchInlineSnapshot(
      '"false && eval(\\"\\\\\\"$QBJS_eval\\\\\\";(hello)&&(world)\\");"',
    );

    expect(
      transformCodeUsingVisitor(
        `false || ${e("foo")} || ${e("bar")} `,
        createFusionVisitor(),
      ),
    ).toMatchInlineSnapshot(
      '"false || eval(\\"\\\\\\"$QBJS_eval\\\\\\";(foo)||(bar)\\");"',
    );

    expect(
      transformCodeUsingVisitor(
        `first || ${e("hello")} || ${e("world")} || ${e("foo")}`,
        createFusionVisitor(),
      ),
    ).toMatchInlineSnapshot(
      '"first || eval(\\"\\\\\\"$QBJS_eval\\\\\\";(hello)||(world)||(foo)\\");"',
    );

    expect(
      transformCodeUsingVisitor(
        `first && ${e("foo")} || bar || ${e("hello")} || ${e("world")}`,
        createFusionVisitor(),
      ),
    ).toMatchInlineSnapshot(
      '"first && eval(\\"\\\\\\"$QBJS_eval\\\\\\";(foo)\\") || bar || eval(\\"\\\\\\"$QBJS_eval\\\\\\";(hello)||(world)\\");"',
    );

    expect(
      transformCodeUsingVisitor(
        `first || hoge || (hoge && ${e("foo")} && ${e("bar")})`,
        createFusionVisitor(),
      ),
    ).toMatchInlineSnapshot(
      '"first || hoge || hoge && eval(\\"\\\\\\"$QBJS_eval\\\\\\";(foo)&&(bar)\\");"',
    );
  });
}
