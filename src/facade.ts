import { types as t, parse, traverse, type Visitor } from "@babel/core";
import { createVisitor } from "./block-statement.js";

import { visitors } from "@babel/traverse";

import { createSwitchStatementVisitor } from "./switch-statement.js";
import { createLogicalExpressionVisitor } from "./logical-expression.js";
import { createConditionalExpressionVisitor } from "./conditional-expression.js";

import generatorPkg from "@babel/generator";
import { traceRuntime } from "./trace.js";
import { createIfElseVisitor } from "./if-else.js";
import { createConstDefinitionsVisitor } from "./const-definitions.js";
const generate = generatorPkg.default;
const visitor = visitors.merge([
  createConstDefinitionsVisitor({ type: "trace" }),
  createIfElseVisitor({ type: "trace" }),
  createVisitor({ type: "trace" }),
  createSwitchStatementVisitor({ type: "trace" }),
  createLogicalExpressionVisitor({ type: "trace" }),
  createConditionalExpressionVisitor({ type: "trace" }),
]);
export const generateTraceCode = (code: string) => {
  const ast = parse(code);
  if (ast === null) {
    throw new Error("errr");
  }
  traverse(ast, visitor);
  return `${traceRuntime.runtimeCode};${generate(ast).code};`;
};
