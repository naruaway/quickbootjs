import { type Visitor, types as t } from "@babel/core";
import { genCode, isEvalBlock, isEvalExpression } from "./util.js";

export const createReferenceCheckVisitor = (): Visitor => {
  return {
    // FunctionDeclaration(path) {
    //   if (path.node.id) {
    //     const binding = path.scope.parent.bindings[path.node.id.name]
    //     if (!binding) return
    //     const refEvalNodes = binding.referencePaths.map(refPath =>
    //       refPath.findParent(p => isEvalBlock(p.node) || isEvalExpression(p.node))
    //     )
    //     if (refEvalNodes.every(Boolean)) {
    //       path.remove()
    //     }
    //     // if (path.scope.parent.bindings[path.node.id.name] === 0) {
    //     //   path.remove()
    //     //   //console.log('not referenced', path.node.id)
    //     //   // console.log(path.node.id.name, path.scope.parent.bindings[path.node.id.name].referencePaths.map(p => genCode(p.parentPath!.node)).join(', '))
    //     // }
    //   }
    // },
    // // VariableDeclarator(path) {
    // //   if (t.isIdentifier(path.node.id)) {
    // //
    //     // const binding = assertNonNull(path.scope.getBinding(path.node.id.name))
    //     const binding = (path.scope.getBinding(path.node.id.name))
    //     if (!binding) return
    //     if (binding.references === 0 && binding.constantViolations.length === 0) {
    //       path.remove()
    //     }
    //   }
    // }
  };
};
