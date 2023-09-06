import {
  type Visitor,
  types as t,
  type NodePath,
  traverse,
  parse,
} from "@babel/core";
import { traceRuntime, type TraceData, loadTrace } from "./trace.js";
import {
  assertNever,
  assertNonNull,
  createEvalBlock,
  createGetPos,
  executeInVm,
  executeInVmAndGetTraceData,
  genCode,
  isPureExpression,
  todo,
  transformCodeUsingVisitor,
} from "./util.js";

let cnt = 0;
// TODO: deterministically generate unique id
const genRandomId = (): string => {
  // if (NODE_ENV === 'test') {
  return "RND" + ++cnt;
  // }
  // const length = 16
  // let result = '';
  // const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  // let counter = 0;
  // while (counter < length) {
  //   result += chars.charAt(Math.floor(Math.random() * chars.length));
  //   counter += 1;
  // }
  // return result;
};

const generateUniqueLabel = () => {
  return t.identifier(`qbjsSwitchStmtLabel_${genRandomId()}`);
};

const traverseUnlabelledBreaksTargetingCurrentSwitchStatement = (
  switchStatementPath: NodePath<t.SwitchStatement>,
  onBreakStatement: (breakStmt: NodePath<t.BreakStatement>) => void,
) => {
  switchStatementPath.traverse({
    SwitchStatement(p) {
      p.skip();
    },
    Loop(p) {
      p.skip();
    },
    BreakStatement(p) {
      if (p.node.label != null) return;
      onBreakStatement(p);
    },
  });
};

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  test("traverseUnlabelledBreaksTargetingCurrentSwitchStatement", () => {
    const foundBreaks: string[] = [];
    traverse(
      assertNonNull(
        parse(`
    switch (something) {
      case xyz:
        while (aaa) {
          /*not this*/ break;
        }
        /*here1*/ break;
        switch (nested) {
          case thisisnested:
            /*not this*/ break;
        }
      default:
        {
          {
            /*here2*/ break;
          }
        }
    }
    `),
      ),
      {
        SwitchStatement(path) {
          traverseUnlabelledBreaksTargetingCurrentSwitchStatement(
            path,
            (breakStmtPath) => {
              foundBreaks.push(genCode(breakStmtPath.node));
            },
          );
          path.skip();
        },
      },
    );
    expect(foundBreaks).toMatchInlineSnapshot(`
      [
        "/*here1*/break;",
        "/*here2*/break;",
      ]
    `);
  });
}

const hasNonVarDeclaration = (
  switchStatementPath: NodePath<t.SwitchStatement>,
): boolean => {
  let found = false;
  switchStatementPath.traverse({
    VariableDeclaration(p) {
      if (p.node.kind !== "var") {
        found = true;
        p.skip();
      }
    },
  });
  return found;
};

// TODO add more test case such as using `default:`, also some expressions can be side effectful (e.g `case doSomething():`)
export const createSwitchStatementVisitor = (
  mode: { type: "trace" } | { type: "optimize"; traceData: TraceData },
): Visitor => {
  const getSwithCasePos = createGetPos("SwitchCase");

  const switchStatementBlockList = new WeakSet();
  const preventTraverse = (
    switchStatement: t.SwitchStatement,
  ): t.SwitchStatement => {
    switchStatementBlockList.add(switchStatement);
    return switchStatement;
  };

  return {
    SwitchStatement(path) {
      if (switchStatementBlockList.has(path.node)) return;
      switchStatementBlockList.add(path.node);

      if (hasNonVarDeclaration(path)) {
        todo(
          "SwitchStatement might have non var declaration such as let/const, which are not handled properly yet",
        );
      }

      if (mode.type === "trace") {
        for (const switchCase of path.node.cases) {
          const pos = assertNonNull(getSwithCasePos(switchCase));
          switchCase.consequent = [
            t.expressionStatement(traceRuntime.traceExpression(pos)),
            ...switchCase.consequent,
          ];
        }
      } else if (mode.type === "optimize") {
        const switchStatementNode = path.node;
        const uniqueId = path.scope.generateUidIdentifier("S");
        const casesPaths = path.get("cases");

        const label = generateUniqueLabel();
        // the semantics of unlabelled `break` targeting the switch statement will accidentally change when we put that `break` inside newly created nested switch statement.
        // So we rewrite them to point to the explicit label
        traverseUnlabelledBreaksTargetingCurrentSwitchStatement(
          path,
          (breakStmtPath) => {
            breakStmtPath.node.label = label;
          },
        );

        path.replaceWith(
          t.blockStatement([
            t.variableDeclaration("let", [
              t.variableDeclarator(uniqueId, switchStatementNode.discriminant),
            ]),
            t.labeledStatement(label, switchStatementNode),
          ]),
        );
        switchStatementNode.discriminant = uniqueId;

        let unusedCases: t.SwitchCase[] = [];

        casesPaths.forEach((switchCasePath, i) => {
          const switchCase = switchCasePath.node;
          const pos = assertNonNull(getSwithCasePos(switchCase));
          const trace = loadTrace(mode.traceData);
          if (!trace.isExecuted(pos)) {
            unusedCases.push(switchCase);
            const next = casesPaths[i + 1]?.node;
            if (
              !next ||
              trace.isExecuted(assertNonNull(getSwithCasePos(next)))
            ) {
              if (
                unusedCases.some((c) => c.consequent.length > 0) &&
                unusedCases.every(
                  (c) => c.test == null || isPureExpression(c.test),
                )
              ) {
                switchCase.consequent = [
                  createEvalBlock([
                    preventTraverse(
                      t.switchStatement(
                        uniqueId,
                        unusedCases.map((c) =>
                          t.switchCase(c.test, c.consequent),
                        ),
                      ),
                    ),
                  ]),
                ];
                unusedCases
                  .filter((c) => c !== switchCase)
                  .forEach((c) => {
                    c.consequent = [];
                  });
              }
            }
          } else {
            unusedCases = [];
          }
        });
      } else {
        assertNever(mode);
      }
    },
  };
};

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  test("switch statement", () => {
    const inputCode = `
    const val = 'hi';
    const result = [];
    switch (val + 't') {
      case 'skipped1':
      case 'skipped2':
        result.push('xyz');
        result.push('xyz2');
        break;
      case 'skipped3':
        result.push('aaa');
        result.push('aaa');
      case 'hit':
        result.push('hello world');
    };
    result;
    `;

    const traceData = executeInVmAndGetTraceData(
      transformCodeUsingVisitor(
        inputCode,
        createSwitchStatementVisitor({ type: "trace" }),
      ),
    );

    const optimizedCode = transformCodeUsingVisitor(
      inputCode,
      createSwitchStatementVisitor({ type: "optimize", traceData }),
    );
    expect(optimizedCode).toMatchInlineSnapshot(`
      "const val = 'hi';
      const result = [];
      {
        let _S = val + 't';
        qbjsSwitchStmtLabel_RND1: switch (_S) {
          case 'skipped1':
          case 'skipped2':
          case 'skipped3':
            {
              \\"$QBJS_evalBlock\\";
              switch (_S) {
                case 'skipped1':
                case 'skipped2':
                  result.push('xyz');
                  result.push('xyz2');
                  break qbjsSwitchStmtLabel_RND1;
                case 'skipped3':
                  result.push('aaa');
                  result.push('aaa');
              }
            }
          case 'hit':
            result.push('hello world');
        }
      }
      ;
      result;"
    `);
    expect(executeInVm(optimizedCode)).toMatchInlineSnapshot(`
      [
        "hello world",
      ]
    `);
  });

  test("switch statement", () => {
    const inputCode = `
    async function hello() {
      switch ('hello') {
        case 'abc':
        case 'xyz':
        case 'aaa':
        case 'hello world':
          await something;
          helloWorld();
      };
    }
    `;

    const traceData = executeInVmAndGetTraceData(
      transformCodeUsingVisitor(
        inputCode,
        createSwitchStatementVisitor({ type: "trace" }),
      ),
    );

    const optimizedCode = transformCodeUsingVisitor(
      inputCode,
      createSwitchStatementVisitor({ type: "optimize", traceData }),
    );
    expect(optimizedCode).toMatchInlineSnapshot(`
      "async function hello() {
        {
          let _S = 'hello';
          qbjsSwitchStmtLabel_RND2: switch (_S) {
            case 'abc':
            case 'xyz':
            case 'aaa':
            case 'hello world':
              {
                \\"$QBJS_evalBlock\\";
                switch (_S) {
                  case 'abc':
                  case 'xyz':
                  case 'aaa':
                  case 'hello world':
                    await something;
                    helloWorld();
                }
              }
          }
        }
        ;
      }"
    `);
  });
}


if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  test("switch statement 2", () => {
    const inputCode = `
    const val = 'hi';
    const result = [];
    switch (val + 't') {
      case 'skipped1':
      case 'skipped2':
        result.push('xyz');
        result.push('xyz2');
        break;
      case 'skipped3':
        result.push('aaa');
        result.push('aaa');
      case 'hit':
        result.push('hello world');
        break;
      case 'hellohello':
        result.push('hellohello');
      case 'worldworld':
        result.push('worldworld');
      default:
        result.push('default');
    };
    result;
    `;

    const traceData = executeInVmAndGetTraceData(
      transformCodeUsingVisitor(
        inputCode,
        createSwitchStatementVisitor({ type: "trace" }),
      ),
    );

    const optimizedCode = transformCodeUsingVisitor(
      inputCode,
      createSwitchStatementVisitor({ type: "optimize", traceData }),
    );
    expect(optimizedCode).toMatchInlineSnapshot(`
      "const val = 'hi';
      const result = [];
      {
        let _S = val + 't';
        qbjsSwitchStmtLabel_RND3: switch (_S) {
          case 'skipped1':
          case 'skipped2':
          case 'skipped3':
            {
              \\"$QBJS_evalBlock\\";
              switch (_S) {
                case 'skipped1':
                case 'skipped2':
                  result.push('xyz');
                  result.push('xyz2');
                  break qbjsSwitchStmtLabel_RND3;
                case 'skipped3':
                  result.push('aaa');
                  result.push('aaa');
              }
            }
          case 'hit':
            result.push('hello world');
            break qbjsSwitchStmtLabel_RND3;
          case 'hellohello':
          case 'worldworld':
          default:
            {
              \\"$QBJS_evalBlock\\";
              switch (_S) {
                case 'hellohello':
                  result.push('hellohello');
                case 'worldworld':
                  result.push('worldworld');
                default:
                  result.push('default');
              }
            }
        }
      }
      ;
      result;"
    `);
    expect(executeInVm(optimizedCode)).toMatchInlineSnapshot(`
      [
        "hello world",
      ]
    `);
  });

  test("switch statement", () => {
    const inputCode = `
    async function hello() {
      switch ('hello') {
        case 'abc':
        case 'xyz':
        case 'aaa':
        case 'hello world':
          await something;
          helloWorld();
      };
    }
    `;

    const traceData = executeInVmAndGetTraceData(
      transformCodeUsingVisitor(
        inputCode,
        createSwitchStatementVisitor({ type: "trace" }),
      ),
    );

    const optimizedCode = transformCodeUsingVisitor(
      inputCode,
      createSwitchStatementVisitor({ type: "optimize", traceData }),
    );
    expect(optimizedCode).toMatchInlineSnapshot(`
      "async function hello() {
        {
          let _S = 'hello';
          qbjsSwitchStmtLabel_RND4: switch (_S) {
            case 'abc':
            case 'xyz':
            case 'aaa':
            case 'hello world':
              {
                \\"$QBJS_evalBlock\\";
                switch (_S) {
                  case 'abc':
                  case 'xyz':
                  case 'aaa':
                  case 'hello world':
                    await something;
                    helloWorld();
                }
              }
          }
        }
        ;
      }"
    `);
  });
}
