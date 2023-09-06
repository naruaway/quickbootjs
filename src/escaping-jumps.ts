import traverseImport from "@babel/traverse";
import * as t from "@babel/types";
const traverse = traverseImport.default;

import templateImport from "@babel/template";
import { parse, type NodePath } from "@babel/core";
import { genMinifiedCode, todo } from "./util.js";
const template = templateImport.default;

export const transformEscapingJumps = (path: NodePath) => {
  let hasEscapingReturn = false;
  const breakOrContinueMap = new Map<
    string,
    { identifier: string; statement: t.BreakStatement | t.ContinueStatement }
  >();

  const registerEscapingBreakOrContinue = (
    statement: t.BreakStatement | t.ContinueStatement,
  ) => {
    const stringified = genMinifiedCode(statement);
    const registered = breakOrContinueMap.get(stringified);
    if (registered) {
      return registered.identifier;
    }
    const identifier = genIdentifier();
    breakOrContinueMap.set(stringified, { statement, identifier });
    return identifier;
  };
  const isEscapingBreakOrContinueNotFound = (): boolean =>
    breakOrContinueMap.size === 0;
  const getRegisteredEscapingBreakOrContinue = () => {
    return Array.from(breakOrContinueMap.values());
  };

  let loopOrSwitchNestLevel = 0;
  let functionNestLevel = 0;
  const loopOrSwitch = {
    enter() {
      loopOrSwitchNestLevel++;
    },
    exit() {
      loopOrSwitchNestLevel--;
    },
  };
  const localLabels: string[] = [];
  let alphabetIndex = 0;
  const alphabetList = "abcdefghijklmnopqrstuvwxyz";
  const genIdentifier = () => {
    const alphabet = alphabetList[alphabetIndex++];
    if (!alphabet) {
      todo(
        "we should actually bail out the optimization when we exaust alphabet",
      );
    }
    return alphabet;
  };

  const BreakOrContinueStatement = (
    path: NodePath<t.BreakStatement | t.ContinueStatement>,
  ) => {
    const label = path.node.label ? path.node.label.name : undefined;
    if (label) {
      if (!localLabels.includes(label)) {
        const identifier = registerEscapingBreakOrContinue(path.node);
        path.replaceWith(
          t.returnStatement(
            t.objectExpression([
              t.objectProperty(t.identifier(identifier), t.numericLiteral(1)),
            ]),
          ),
        );
        path.skip();
      } else {
      }
    } else {
      if (loopOrSwitchNestLevel > 0) {
      } else {
        const identifier = registerEscapingBreakOrContinue(path.node);
        path.replaceWith(
          t.returnStatement(
            t.objectExpression([
              t.objectProperty(t.identifier(identifier), t.numericLiteral(1)),
            ]),
          ),
        );
        path.skip();
      }
    }
  };

  path.traverse({
    ContinueStatement: BreakOrContinueStatement,
    BreakStatement: BreakOrContinueStatement,
    ReturnStatement(path) {
      if (functionNestLevel > 0) {
      } else {
        const arg = path.node.argument;
        hasEscapingReturn = true;
        if (arg) {
          // `return {R: true, V: value_here}`
          path.replaceWith(
            t.returnStatement(
              t.objectExpression([
                t.objectProperty(t.identifier("R"), t.numericLiteral(1)),
                t.objectProperty(t.identifier("V"), arg),
              ]),
            ),
          );
        } else {
          // `return {R: true}`
          path.replaceWith(
            t.returnStatement(
              t.objectExpression([
                t.objectProperty(t.identifier("R"), t.booleanLiteral(true)),
              ]),
            ),
          );
        }
        path.skip();
      }
    },
    YieldExpression(path) {
      todo("yield is not yet handled");
    },

    // break or continue will be affected by Loop, SwitchStatement, or LabeledStatement
    Loop: loopOrSwitch,
    SwitchStatement: loopOrSwitch,
    LabeledStatement: {
      enter(path) {
        localLabels.push(path.node.label.name);
      },
      exit() {
        localLabels.pop();
      },
    },
    // "return" will be affected by any function scope
    Function: {
      enter() {
        functionNestLevel++;
      },
      exit() {
        functionNestLevel--;
      },
    },
  });

  // TODO: need to make sure this is actually unique. (e.g. generate replaced code before replacing code with eval and then only apply Terser mangle?)
  const uniqueIdentifier = "$8";
  return {
    getEvalCode() {
      return `(()=>{${genMinifiedCode(path.node)}})()`;
    },
    getStubCode(evalExpression: t.CallExpression): t.Statement[] {
      if (!hasEscapingReturn && isEscapingBreakOrContinueNotFound()) {
        return [t.expressionStatement(evalExpression)];
      } else {
        return [
          t.blockStatement([
            t.variableDeclaration("let", [
              t.variableDeclarator(
                t.identifier(uniqueIdentifier),
                evalExpression,
              ),
            ]),
            t.ifStatement(
              t.identifier(uniqueIdentifier),
              t.blockStatement([
                ...getRegisteredEscapingBreakOrContinue().map(
                  ({ identifier, statement }) =>
                    t.ifStatement(
                      t.memberExpression(
                        t.identifier(uniqueIdentifier),
                        t.identifier(identifier),
                      ),
                      statement,
                    ),
                ),
                ...(hasEscapingReturn
                  ? [
                      t.ifStatement(
                        t.memberExpression(
                          t.identifier(uniqueIdentifier),
                          t.identifier("R"),
                        ),
                        t.returnStatement(
                          t.memberExpression(
                            t.identifier(uniqueIdentifier),
                            t.identifier("V"),
                          ),
                        ),
                      ),
                    ]
                  : []),
              ]),
            ),
          ]),
        ];
      }
    },
  };
};

export const transformEscapingJumpsFromNode = (node: t.Statement) => {
  let p: NodePath | undefined = undefined;
  traverse(t.file(t.program([node])), {
    Program(path) {
      p = path;
    },
  });
  if (!p) throw new Error("path should exist");
  return transformEscapingJumps(p);
};

//TODO: write test for
//transformEscapingJumpsFromNode
//`switch(_SCGET(1)){case"dragenter":case"dragleave":ko=null;break}`
