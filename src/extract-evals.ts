import { type Visitor, types as t, traverse } from "@babel/core";
import { parseEvalExpression } from "./util.js";

const MIN_CODE_SIZE_TO_BE_EXTRACTED = 32;

export const extractEvals = (ast: t.File, keepCode = false) => {
  const extractedCodes: string[] = [];

  traverse(ast, {
    CallExpression(path) {
      const parsedEval = parseEvalExpression(path.node);
      if (!parsedEval) return;

      if (parsedEval.code.length < MIN_CODE_SIZE_TO_BE_EXTRACTED) {
        // unwrap eval() when the code is small enough
        path.replaceWithSourceString(parsedEval.code);
      } else {
        if (!keepCode) {
          extractedCodes.push(parsedEval.code);
          const extractedCodeIndex = extractedCodes.length - 1;
          path.replaceWith(
            t.callExpression(t.identifier("eval"), [
              t.callExpression(t.identifier("_X"), [
                t.numericLiteral(extractedCodeIndex),
              ]),
            ]),
          );
        } else {
          const arg = path.node.arguments[0];
          if (!t.isStringLiteral(arg))
            throw new Error("eval arg should be string literal");
          path.replaceWith(
            t.callExpression(t.identifier("eval"), [
              t.stringLiteral(parsedEval.code),
            ]),
          );
        }
      }
    },
  });

  return {
    extractedCodes,
  };
};
