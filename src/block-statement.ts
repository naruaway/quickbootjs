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
  isEvalExpression,
  isFunctionBlock,
} from "./util.js";
const generate = generatorPkg.default;
import { traceRuntime, type TraceData, loadTrace } from "./trace.js";

const extractIdentifiersFromLval = (lval: t.LVal): string[] => {
  // FIXME: handle the following: MemberExpression | RestElement | ArrayPattern | ObjectPattern
  if (t.isIdentifier(lval)) {
    return [lval.name];
  }
  if (t.isAssignmentPattern(lval)) {
    return extractIdentifiersFromLval(lval.left);
  }
  throw new Error(
    `extractIdentifiersFromLval is not implemented properly yet for ${lval.type}`,
  );
};

// contract: put things which was not executed in to newly created BlockStatement, which is called "evalBlock" without changing the runtime semantics
// After the transformation, an evalBlock can be replaced with a direct `eval` with special transformation for escaping jumps (e.g. return/continue/break) which cannot cross the eval boundary
export const createVisitor = (
  mode: { type: "trace" } | { type: "optimize"; traceData: TraceData },
): Visitor => {
  return {
    SequenceExpression(path) {
      if (isEvalExpression(path.node)) {
        // make sure we do not do anything inside eval expression
        path.skip();
        return;
      }
    },
    BlockStatement(path) {
      // TODO: this eval block skipping should be used for every other visitors for testing
      if (isEvalBlock(path.node)) {
        path.skip();
        return;
      }
      const getStmtPos = createGetPos("Statement");

      if (mode.type === "trace") {
        path.node.body = path.node.body.flatMap((stmt) => {
          const pos = getStmtPos(stmt);
          return pos
            ? [t.expressionStatement(traceRuntime.traceExpression(pos)), stmt]
            : [stmt];
        });
      } else if (mode.type === "optimize") {
        const trace = loadTrace(mode.traceData);
        if (path.node.body.some((s) => !getStmtPos(s))) {
          /// Probably somehow we are processing the same BlockStatement... let's skip
          return;
        }

        const executedFlags = path.node.body.map((stmt) =>
          trace.isExecuted(assertNonNull(getStmtPos(stmt))),
        );

        // If the BlockStatement is for function definition and no statements were executed, we can turn the whole block into evalBlock.
        // TODO: if it does not include any escaping `var`, we can mark the whole block into evalBlock in general
        if (executedFlags.every((f) => !f) && isFunctionBlock(path)) {
          path.replaceWith(createEvalBlock(path.node.body));
          return;
        }

        const firstSkippedIndex = executedFlags.findIndex(
          (executed) => !executed,
        );
        if (firstSkippedIndex === -1) return;

        path.node.body.splice(
          firstSkippedIndex,
          Infinity,
          createEvalBlock(path.node.body.slice(firstSkippedIndex)),
        );
      } else {
        assertNever(mode);
      }
    },
  };
};

const generateTraceCode = (code: string) => {
  const ast = parse(code);
  if (ast === null) {
    throw new Error("errr");
  }
  traverse(ast, createVisitor({ type: "trace" }));

  return generate(ast).code;
};

const generateOptimizedCode = (code: string, traceData: TraceData) => {
  const ast = parse(code);
  if (ast === null) {
    throw new Error("errr");
  }
  traverse(ast, createVisitor({ type: "optimize", traceData }));

  return generate(ast).code;
};

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  test("mytest", () => {
    const inputCode = `
      const myfn2 = () => {
        console.log('myfn2');
      };
      if (true) {
        console.log('executed in if')
      } else {
        var helloInElse;
        console.log('not executed in else', helloInElse)
      }
      console.log("hello");
      {
        console.log('block tst 1');
        console.log('block tst 2');
      }
      for (let i = 0; i < 2; ++i) {
        console.log("world", myvar);
        continue;
        var myvar;
        function myfn3() {
          console.log('myfn3')
        }
        () => {var myvar2 = 99;};
        console.log("unexecuted");
        do {
           console.log('inside do-while');
        } while (false);
        console.log("unexecuted2");
      }
      `;

    const traceCode = generateTraceCode(inputCode);

    const traceData = executeInVmAndGetTraceData(traceCode);

    const optimizedCode = generateOptimizedCode(inputCode, traceData);

    expect(optimizedCode).toMatchInlineSnapshot(`
      "const myfn2 = () => {
        \\"$QBJS_evalBlock\\";
        console.log('myfn2');
      };
      if (true) {
        console.log('executed in if');
      } else {
        {
          \\"$QBJS_evalBlock\\";
          var helloInElse;
          console.log('not executed in else', helloInElse);
        }
      }
      console.log(\\"hello\\");
      {
        console.log('block tst 1');
        console.log('block tst 2');
      }
      for (let i = 0; i < 2; ++i) {
        console.log(\\"world\\", myvar);
        continue;
        {
          \\"$QBJS_evalBlock\\";
          var myvar;
          function myfn3() {
            console.log('myfn3');
          }
          () => {
            var myvar2 = 99;
          };
          console.log(\\"unexecuted\\");
          do {
            console.log('inside do-while');
          } while (false);
          console.log(\\"unexecuted2\\");
        }
      }"
    `);
    //executeInVm(optimizedCode);
  });
}
