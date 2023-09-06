import { type Visitor, types as t, type NodePath } from "@babel/core";
import {
  isEvalBlock,
  evalExpression,
  isEvalExpression,
  isFunctionBlock,
  removeEvalBlockMarker,
  removeEvalExpressionMarker,
  genMinifiedCode,
} from "./util.js";

import { transformEscapingJumps } from "./escaping-jumps.js";

const hasAwaitOrYield = (path: NodePath): boolean => {
  let found = false;
  path.traverse({
    AwaitExpression() {
      found = true;
    },
    YieldExpression() {
      found = true;
    },
  });
  return found;
};

export const createReplaceWithEvalVisitor = (): Visitor => ({
  SequenceExpression(path) {
    if (!isEvalExpression(path.node)) return;
    removeEvalExpressionMarker(path);

    // await / yield inside eval does not work
    if (hasAwaitOrYield(path)) return;

    path.replaceWith(
      evalExpression(`(()=>{return (${genMinifiedCode(path.node)})})()`),
    );
  },
  BlockStatement(path) {
    if (!isEvalBlock(path.node)) return;
    removeEvalBlockMarker(path);

    // await / yield inside eval does not work
    if (hasAwaitOrYield(path)) return;

    // If an evalBlock is empty, do nothing
    if (path.node.body.length === 0) return;

    if (isFunctionBlock(path)) {
      path.replaceWith(
        t.blockStatement([
          t.returnStatement(
            evalExpression(`(()=>{${genMinifiedCode(path.node)}})()`),
          ),
        ]),
      );
    } else {
      const escapingJumps = transformEscapingJumps(path);
      path.replaceWith(
        t.blockStatement(
          escapingJumps.getStubCode(
            evalExpression(`${escapingJumps.getEvalCode()}`),
          ),
        ),
      );
    }
  },
});
