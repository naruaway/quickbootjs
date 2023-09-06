import { parse, traverse, type Visitor } from "@babel/core";

import { createVisitor } from "./block-statement.js";

import { createSwitchStatementVisitor } from "./switch-statement.js";
import { createLogicalExpressionVisitor } from "./logical-expression.js";
import { createConditionalExpressionVisitor } from "./conditional-expression.js";
import type { TraceData } from "./trace.js";
import { createReplaceWithEvalVisitor } from "./replace-with-eval.js";

import { visitors } from "@babel/traverse";
import { createReferenceCheckVisitor } from "./reference-check.js";
import { createFusionVisitor } from "./fusion.js";
import { extractEvals } from "./extract-evals.js";
import { minifyCode } from "./terser.js";
import { assertNonNull, genMinifiedCode } from "./util.js";
import { createEvalBlockScopeFixVisitor } from "./fix-eval-block-scope.js";
import { createIfElseVisitor } from "./if-else.js";
import { createConstDefinitionsVisitor } from "./const-definitions.js";

const runtime = `"use strict";

(() => {
    function getExtractedFileUrl() {
      const src = document.currentScript.src;
      const candidate = src.replace(/(\.quickbootjs-main)?\.js$/, '.quickbootjs-extracted.js')
      if (candidate === src) throw new Error('cannot figure out extracted file URL');
      return candidate
    }
    const extractedJsonUrl = getExtractedFileUrl();
    const cleanupLoading = (() => {
          /* step function for CSS animation will not run on GPU on Safari so we should use easing or cubic-bezier */
    /* is pointerEvents: none enough? we need to make sure this will never receive anything, also consider a11y maybe but not sure whether screen reader works when the main thread freezes*/

      let e = document.createElement('div');
      e.id = 'QBJSL';
      e.className = 'a';
      e.innerHTML = '<div><style>@keyframes QBJSL1{50%{opacity:0}to{opacity:1}}@keyframes QBJSL2{50%{opacity:0}to{opacity:1}}@keyframes QBJSS{to{transform:rotate(360deg)}}#QBJSL{opacity:0;backdrop-filter:blur(2px);pointer-events:none;background-color:#0003;display:flex;position:fixed;inset:0}#QBJSL *{border:10px solid #000000e6;border-color:#000000e6 #0000;border-radius:999px;width:3rem;height:3rem;margin:auto;animation:1.5s linear infinite QBJSS}#QBJSL.a{animation:2s forwards QBJSL1}#QBJSL.b{animation:2s forwards QBJSL2}</style></div>'
      document.body.appendChild(e);
      let t = setInterval(() => {
        e.className = e.className === 'a' ? 'b' : 'a'
      }, 200)
      let cleanedup = false;
      return () => {
        if (!cleanedup) {
          clearInterval(t);
          e.remove();
          cleanedup = true
        }
      }
    })();


    let fetchedExtractedJs;
    const ac = new AbortController();
    fetch(extractedJsonUrl, {signal: ac.signal}).then(r => r.text()).then(text => {
      fetchedExtractedJs = text;
      cleanupLoading()
    });

    const syncXhr = (url) => {
      ac.abort();
      const request = new XMLHttpRequest();
      request.open("GET", extractedJsonUrl, false);
      try {
        request.send(null);
      } catch(e) {
        console.log('sync xhr error', e);
      }
      // TODO error handling
      if (request.status === 200) {
        return request.responseText
      }
    }


  // Maybe we can use Atomics.wait instead of sync XHR? Note sure which is better even if it's possible https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/wait
// FIXME error handling
  let fetchedFn;
  const fetchCodeSync = () => {
    if (fetchedFn) return fetchedFn;
    fetchedExtractedJs = fetchedExtractedJs || syncXhr(extractedJsonUrl);
    cleanupLoading();
    fetchedFn = Function(fetchedExtractedJs)()
    return fetchedFn
  }

  globalThis._X = (i) => {
      const q = fetchCodeSync();
      const code = q.getCode(i);
      return code
  };
})();
  `;

export const generateOptimizedCode = async (
  code: string,
  traceData: TraceData,
  stripRuntime = false,
  keepCode = false,
) => {
  let ast = parse(code);
  if (ast === null) {
    throw new Error("errr");
  }

  traverse(
    ast,
    visitors.merge([
      createConstDefinitionsVisitor({ type: "optimize", traceData }),
      createIfElseVisitor({ type: "optimize", traceData }),
      createVisitor({ type: "optimize", traceData }),
      createSwitchStatementVisitor({ type: "optimize", traceData }),
      createLogicalExpressionVisitor({ type: "optimize", traceData }),
      createConditionalExpressionVisitor({ type: "optimize", traceData }),
    ]),
  );

  traverse(ast, createEvalBlockScopeFixVisitor());

  traverse(ast, createReferenceCheckVisitor());

  traverse(ast, createReplaceWithEvalVisitor());

  {
    // fusion after minification so that the minification can create some more opportunities for the fusion
    ast = assertNonNull(parse(await minifyCode(genMinifiedCode(ast))));
    traverse(ast, createFusionVisitor());
  }

  const extracted = extractEvals(ast, keepCode);

  return {
    code: `${stripRuntime ? "" : runtime}${await minifyCode(
      genMinifiedCode(ast),
    )}`,
    extracted,
  };
};
