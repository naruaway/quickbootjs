import { type Visitor, types as t, type NodePath } from "@babel/core";
import {
  isEvalBlock,
  evalExpression,
  isEvalExpression,
  isFunctionBlock,
  removeEvalBlockMarker,
  removeEvalExpressionMarker,
  genCode,
  assertNonNull,
} from "./util.js";

import generatorPkg from "@babel/generator";
import { transformEscapingJumps } from "./escaping-jumps.js";
const generate = generatorPkg.default;

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
// https://developer.mozilla.org/en-US/docs/Glossary/Hoisting
// Let's consider const/let/class as "non-hoisting" since we can probably safely assume the original source does not rely on throwing ReferenceError in the following case:
//```
//const x = 1;
//{
//  console.log(x); // ReferenceError
//  const x = 2;
//}
//
export const fixHoistedDeclarations = (
  nodePath: NodePath<t.BlockStatement>,
): void => {
  const functionParent = nodePath.scope.getFunctionParent();

  const blockParent = assertNonNull(nodePath.parentPath).scope.getBlockParent();
  const varIdentifiersSet = new Set<string>();
  const functionDeclarations: t.FunctionDeclaration[] = [];

  nodePath.traverse({
    FunctionDeclaration(path) {
      const myscope = assertNonNull(
        path.parentPath.parentPath,
      ).scope.getBlockParent();
      if (myscope !== blockParent) return;
      functionDeclarations.push(path.node);
      path.remove();
    },
    VariableDeclaration(path) {
      if (path.node.kind !== "var") return;
      if (path.scope.getFunctionParent() !== functionParent) return;

      path.node.declarations
        .flatMap((d) => extractIdentifiersFromLval(d.id))
        .forEach((id) => {
          varIdentifiersSet.add(id);
        });
    },
    ImportDeclaration() {
      throw new Error("ImportDeclaration should not be found here");
    },
  });

  const varIdentifiers = Array.from(varIdentifiersSet).sort();

  nodePath.replaceWithMultiple([
    ...(varIdentifiers.length > 0
      ? [
          t.variableDeclaration(
            "var",
            varIdentifiers.map((v) => t.variableDeclarator(t.identifier(v))),
          ),
        ]
      : []),
    ...functionDeclarations,
    nodePath.node,
  ]);
};

export const createEvalBlockScopeFixVisitor = (): Visitor => ({
  BlockStatement(path) {
    if (!isEvalBlock(path.node)) return;

    // if the evalBlock is a function body, there is nothing to fix in terms of variable scoping
    if (path.parentPath.isFunction()) return;

    fixHoistedDeclarations(path);
  },
});
