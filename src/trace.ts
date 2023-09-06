import { types as t, parse, traverse, type Visitor } from "@babel/core";

// FIXME: Deal with potential name collision although it should be rare case, probably just emit error if we find this identifier (string or souce comment is fine) in the original source
const traceRuntimeIdentifier = "__QUICKBOOTJS__";
const traceDataIdentifier = "__QUICKBOOTJS_TRACE__";

export interface TraceData {
  counts: { [pos: string]: number };
}

export const loadTrace = (traceData: TraceData) => {
  return {
    isExecuted: (pos: string) => (traceData.counts[pos] ?? 0) > 0,
  };
};
export const traceRuntime = {
  identifier: traceRuntimeIdentifier,
  traceDataIdentifier,
  traceExpression: (pos: string) =>
    t.callExpression(
      t.memberExpression(
        t.identifier(traceRuntimeIdentifier),
        t.identifier("trace"),
      ),
      [t.stringLiteral(pos)],
    ),
  traceConstExpression: (exp: t.Expression, pos: string) =>
    t.callExpression(
      t.memberExpression(
        t.identifier(traceRuntimeIdentifier),
        t.identifier("traceConst"),
      ),
      [exp, t.stringLiteral(pos)],
    ),
  runtimeCode: `
  globalThis.${traceDataIdentifier} = {counts: {}};
  globalThis.${traceRuntimeIdentifier} = {
    trace(pos) {
      const traceData = globalThis.${traceDataIdentifier};
      const count = traceData.counts[pos];
      traceData.counts[pos] = count === undefined ? 1 : count + 1;
    },
    traceConst(exp, pos) {
      return new Proxy(
        exp,
        new Proxy(
          {},
          {
            get(_target, prop, _receiver) {
              return (...args) => {
                const traceData = globalThis.${traceDataIdentifier};
                const count = traceData.counts[pos];
                traceData.counts[pos] = count === undefined ? 1 : count + 1;
                return Reflect[prop](...args);
              };
            },
          },
        ),
      );
    },
    traceTmp(name, obj) {
      return new Proxy(
        obj,
        new Proxy({}, {
          get(_, trapName) {
            return (...args) => {
              console.log(name, trapName)
              return Reflect[trapName](...args)
            }
          }
        })
      )
    }
  };
`,
};
