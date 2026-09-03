// @types/pdf-parse only declares the package's main entry ("pdf-parse"),
// not the internal path we import from in src/lib/pdf-text.ts
// ("pdf-parse/lib/pdf-parse.js") — that subpath is used deliberately to
// skip a self-test bug in the package's top-level index.js. Without this,
// TypeScript has no declaration for that path and fails the build under
// strict mode (TS7016).
declare module "pdf-parse/lib/pdf-parse.js" {
  import PdfParse from "pdf-parse";
  export default PdfParse;
}
