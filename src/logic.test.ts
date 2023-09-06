import { test, expect } from "vitest";
import { generateOptimizedCode } from "./optimize.js";
import { executeInVm, executeInVmAndGetTraceData } from "./util.js";
import { generateTraceCode } from "./facade.js";
import { formatCode } from "./testutil.js";

test("whole logic test", async () => {
  const input = `
  function mytest() {
    const hello = globalThis.hello || 'hello'
    const result = [];
    result.push(myvar);
    switch (hello) {
      case 'skipped1':
        result.push('skipped1')
      case 'skipped2':
        var myvar;
        result.push('skipped2');
        break;
      case 'hello':
        result.push('hello')
      default:
        result.push('default')
    }
    return result;
  }
  mytest()
`;
  const traceCode = generateTraceCode(input);
  const traceData = executeInVmAndGetTraceData(traceCode);
  const { code: optimizedCode } = await generateOptimizedCode(
    input,
    traceData,
    true,
    true,
  );
  expect(await formatCode(optimizedCode)).toMatchInlineSnapshot(`
    "function mytest() {
      const hello = globalThis.hello || \\"hello\\",
        result = [];
      result.push(myvar);
      {
        let _S = hello;
        e: switch (_S) {
          case \\"skipped1\\":
          case \\"skipped2\\":
            var myvar;
            {
              let $8 = eval(
                '(()=>{{switch(_S){case\\"skipped1\\":result.push(\\"skipped1\\");case\\"skipped2\\":var myvar;result.push(\\"skipped2\\");return{a:1}}}})()',
              );
              if ($8 && $8.a) break e;
            }
          case \\"hello\\":
            result.push(\\"hello\\");
          default:
            result.push(\\"default\\");
        }
      }
      return result;
    }
    mytest();
    "
  `);

  const verifyTheSameSemantics = (globals: Record<string, unknown>) => {
    const uniqueGlobalName = "QUICKBOOTJS_TEST_EVAL_COUNT";
    const clonedGlobals = structuredClone(globals);
    const a = executeInVm(input, clonedGlobals);
    const b = executeInVm(traceCode, clonedGlobals);
    const c = executeInVm(
      optimizedCode.replace(
        /\beval\(/g,
        `eval("globalThis.${uniqueGlobalName} = (globalThis.${uniqueGlobalName} ?? 0) + 1;"+`,
      ),
      clonedGlobals,
    );
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    return { value: a, evalExecutionCount: clonedGlobals[uniqueGlobalName] };
  };

  expect(verifyTheSameSemantics({ hello: "skipped2" })).toMatchInlineSnapshot(`
    {
      "evalExecutionCount": 1,
      "value": [
        undefined,
        "skipped2",
      ],
    }
  `);
});
