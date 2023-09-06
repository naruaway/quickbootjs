import { minify } from "terser";

export const minifyCode = async (code: string) => {
  const result = await minify(code, { compress: { passes: 5 } });
  if (typeof result.code !== "string") throw new Error("Terser error");
  return result.code;
};

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  const { formatCode } = await import("./testutil.js");

  const mini = async (code: string) => formatCode(await minifyCode(code));

  test("terser", async () => {
    // eval should not be expanded by Terser
    expect(
      await mini(`const f = () => {console.log('hello')}; eval('f()')`),
    ).toMatchInlineSnapshot(
      `
      "const f = () => {
        console.log(\\"hello\\");
      };
      eval(\\"f()\\");
      "
    `,
    );
    expect(await mini(`(() => {var x; console.log('hello')})(); `))
      .toMatchInlineSnapshot(`
      "console.log(\\"hello\\");
      "
    `);
    // Terser should not be smart enough to look into direct eval calls
    expect(await mini(`(() => {var x; console.log('hello'); eval('')})(); `))
      .toMatchInlineSnapshot(`
      "(() => {
        var x;
        console.log(\\"hello\\"), eval(\\"\\");
      })();
      "
    `);
    // "if" chain should be converted to "&&" chain
    expect(await mini(`if(first() && second()) {if (third()) {fourth()}}`))
      .toMatchInlineSnapshot(`
      "first() && second() && third() && fourth();
      "
    `);
    expect(await mini(`if(first() && second()) {if (third()) {fourth()}}`))
      .toMatchInlineSnapshot(`
      "first() && second() && third() && fourth();
      "
    `);

    // labels should be mangled even there are direct evals
    expect(
      await mini(`
mylabel: switch(eval(x1)) {
  case eval(x2):
  case eval(x3):
    eval(x4)
    switch(eval(x5)) {
      case "abc":
        eval(x6)
      case "def":
        break mylabel
    }
}
`),
    ).toMatchInlineSnapshot(`
      "a: switch (eval(x1)) {
        case eval(x2):
        case eval(x3):
          switch ((eval(x4), eval(x5))) {
            case \\"abc\\":
              eval(x6);
            case \\"def\\":
              break a;
          }
      }
      "
    `);

    // In this case, I think we can remove mylabel and convert `break mylabel` into `break` but Terser does not seem to be smart enough...
    expect(
      await mini(`
if (something) {
mylabel: switch(eval(x1)) {
  case eval(x2):
  case eval(x3):
    eval(x4)
      case "abc":
        eval(x6)
        break mylabel
      case "def":
        eval(x9)
}
}
`),
    ).toMatchInlineSnapshot(`
      "if (something)
        e: switch (eval(x1)) {
          case eval(x2):
          case eval(x3):
            eval(x4);
          case \\"abc\\":
            eval(x6);
            break e;
          case \\"def\\":
            eval(x9);
        }
      "
    `);
  });
}
