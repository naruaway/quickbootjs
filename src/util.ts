import {
  type Node,
  types as t,
  type NodePath,
  type Visitor,
  parse,
  traverse,
} from "@babel/core";
import * as vm from "node:vm";

import generatorPkg from "@babel/generator";
import { traceRuntime, type TraceData } from "./trace.js";
const generate = generatorPkg.default;

export const assertNever = (_x: never): never => {
  throw new Error("assertNever");
};
export const assertNonNull = <T>(x: T | undefined | null): T => {
  if (x == null) throw new Error("assertNonNull");
  return x;
};

export const genCode = (node: t.Node): string => {
  return generate(node).code;
};

export const genMinifiedCode = (node: t.Node): string =>
  generate(node, { minified: true }).code;

export const isPureExpression = (node: t.Expression) => {
  let isPure = false;
  try {
    traverse(t.program([t.expressionStatement(node)]), {
      Expression(path) {
        const result = path.evaluate();
        if (result.confident) {
          isPure = true;
          path.skip();
        }
      },
    });
  } catch (e) {
    // ignore error here... somehow if we pass an expression with unbound identifier, it throws
  }
  return isPure;
};

export const parseExpression = (code: string): t.Expression => {
  let exp: t.Expression | undefined = undefined;

  traverse(assertNonNull(parse(code)), {
    Expression(path) {
      exp = path.node;
      path.skip();
    },
  });

  return assertNonNull(exp);
};

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  test("isPureExpression", () => {
    expect(isPureExpression(parseExpression("123"))).toBe(true);
    expect(
      isPureExpression(parseExpression('({"hello":"world","n":123})')),
    ).toBe(true);
    expect(
      isPureExpression(parseExpression('({"hello":"world","n":fn()})')),
    ).toBe(false);
    expect(isPureExpression(parseExpression('("HELLO WORLD")'))).toBe(true);
  });
}

export const transformCodeUsingVisitor = (
  code: string,
  visitor: Visitor,
): string => {
  const ast = parse(code);
  if (ast === null) {
    throw new Error("errr");
  }
  traverse(ast, visitor);
  return generate(ast).code;
};

export const createGetPos =
  (tag: string) =>
  (node: Node): string | undefined => {
    const loc = node.loc;
    if (!loc) return undefined;
    return `${tag}/${loc.start.line}:${loc.start.column}`;
  };

export const todo = (msg: string) => {
  throw new Error(msg);
};

export const executeInVm = (
  code: string,
  globals: Record<string, unknown> = {},
): unknown => {
  const context = vm.createContext(globals);
  return vm.runInContext(`"use strict";${code}`, context);
};

export const executeInVmAndGetTraceData = (code: string): TraceData => {
  return executeInVm(
    `${traceRuntime.runtimeCode};${code};globalThis.${traceRuntime.traceDataIdentifier}`,
  );
};

// FIXME: Add Math.random() to avoid accidental collision
export const EVAL_CALL_MARKER = "$QBJS_eval";
export const evalExpression = (code: string) =>
  t.callExpression(t.identifier("eval"), [
    t.stringLiteral(`"${EVAL_CALL_MARKER}";${code}`),
  ]);
export const parseEvalExpression = (
  node: t.Node,
): { code: string } | undefined => {
  if (isEvalCall(node)) {
    if (!t.isCallExpression(node)) throw new Error("assertion failure");
    const arg = node.arguments[0];
    if (!t.isStringLiteral(arg)) throw new Error("assertion failure");

    return {
      code: arg.value.slice(EVAL_CALL_MARKER.length + 3),
    };
  }
  return undefined;
};

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  test("eval expressions", () => {
    expect(genCode(evalExpression("hello();"))).toMatchInlineSnapshot(
      '"eval(\\"\\\\\\"$QBJS_eval\\\\\\";hello();\\")"',
    );
    expect(parseEvalExpression(evalExpression("hello();")))
      .toMatchInlineSnapshot(`
      {
        "code": "hello();",
      }
    `);
  });
}

export const isEvalCall = (node: t.Node): boolean => {
  if (
    !(
      t.isCallExpression(node) &&
      t.isIdentifier(node.callee) &&
      node.callee.name === "eval"
    )
  )
    return false;
  if (node.arguments.length !== 1) return false;
  const firstArg = node.arguments[0];
  if (!t.isStringLiteral(firstArg)) return false;
  return firstArg.value.startsWith(`"${EVAL_CALL_MARKER}";`);
};

// FIXME: Add Math.random() to avoid accidental collision
const EVAL_EXPRESSION_MARKER = "$QBJS_evalExp";

export const createEvalExpression = (exp: t.Expression): t.Expression => {
  return t.sequenceExpression([t.stringLiteral(EVAL_EXPRESSION_MARKER), exp]);
};

export const isEvalExpression = (exp: t.Node): boolean => {
  if (!t.isSequenceExpression(exp)) return false;
  if (exp.expressions.length !== 2) return false;
  const firstExp = exp.expressions[0];
  return (
    firstExp &&
    t.isStringLiteral(firstExp) &&
    firstExp.value === EVAL_EXPRESSION_MARKER
  );
};

// FIXME: Add Math.random() to avoid accidental collision
const EVAL_BLOCK_MARKER = "$QBJS_evalBlock";

export const createEvalBlock = (body: t.Statement[]): t.BlockStatement => {
  return t.blockStatement([
    t.expressionStatement(t.stringLiteral(EVAL_BLOCK_MARKER)),
    ...body,
  ]);
};

export const isEvalBlock = (stmt: t.Statement): boolean => {
  if (!t.isBlockStatement(stmt)) return false;
  const firstStmt = stmt.body[0];
  if (!firstStmt) return false;
  return (
    t.isExpressionStatement(firstStmt) &&
    t.isStringLiteral(firstStmt.expression) &&
    firstStmt.expression.value === EVAL_BLOCK_MARKER
  );
};

export const removeEvalExpressionMarker = (
  evalExpression: NodePath<t.SequenceExpression>,
): void => {
  if (!isEvalExpression(evalExpression.node)) {
    throw new Error("this is not an evalExpression");
  }
  evalExpression.replaceWith(evalExpression.node.expressions[1]);
};

export const removeEvalBlockMarker = (
  evalBlock: NodePath<t.BlockStatement>,
): void => {
  if (!isEvalBlock(evalBlock.node)) {
    throw new Error("this is not an evalBlock");
  }
  const firstStmtPath = evalBlock.get("body.0");
  if (Array.isArray(firstStmtPath)) {
    throw new Error("err");
  }
  firstStmtPath.remove();
};

export const isFunctionBlock = (nodePath: NodePath): boolean => {
  if (!nodePath.isBlockStatement()) return false;
  const parentPath = nodePath.parentPath;
  return (
    parentPath.isFunctionDeclaration() ||
    parentPath.isFunctionExpression() ||
    parentPath.isArrowFunctionExpression()
  );
};

export const withAdditionalSuffixForJsFilePath = (
  jsFilePath: string,
  suffix: string,
) => {
  if (!jsFilePath.endsWith(".js"))
    throw new Error(`${jsFilePath} does not end with ".js"`);
  return jsFilePath.replace(/\.js$/, `.${suffix}`);
};
