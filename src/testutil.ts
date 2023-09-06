import * as prettier from "prettier";

export const formatCode = async (code: string): Promise<string> => {
  return await prettier.format(code, { parser: "babel" });
};
