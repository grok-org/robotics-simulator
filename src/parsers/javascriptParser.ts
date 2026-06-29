import type { Program, Statement, WhileStatement, FunctionDeclaration } from "acorn";
import * as acorn from "acorn";

function isWhileTrue(node: Statement): node is WhileStatement {
  if (node.type !== "WhileStatement") return false;
  const test = (node as WhileStatement).test;
  return test.type === "Literal" && (test as { value: unknown }).value === true;
}
function isFuncDecl(node: Statement): node is FunctionDeclaration {
  return node.type === "FunctionDeclaration";
}

function parseProgram(code: string): Program {
  return acorn.parse(code, { ecmaVersion: "latest", sourceType: "script" }) as unknown as Program;
}
function statementBody(node: WhileStatement): Statement[] {
  const body = node.body;
  return body.type === "BlockStatement"
    ? (body as { body: Statement[] }).body
    : [body as unknown as Statement];
}

export function extractTickBody(code: string): string {
  let ast: Program;
  try {
    ast = parseProgram(code);
  } catch {
    return extractTickBodyRegex(code);
  }
  const body = ast.body as Statement[];
  const whileIdx = body.findIndex(isWhileTrue);
  if (whileIdx === -1) return code;
  const initStmts = body.slice(0, whileIdx);
  const whileStmts = statementBody(body[whileIdx] as WhileStatement);
  const afterStmts = body.slice(whileIdx + 1);
  return [
    ...initStmts.map((s) => code.slice(s.start!, s.end!)),
    ...afterStmts.filter(isFuncDecl).map((s) => code.slice(s.start!, s.end!)),
    ...whileStmts.map((s) => code.slice(s.start!, s.end!)),
  ].join(";\n");
}

function extractTickBodyRegex(code: string): string {
  const match = /while\s*\(\s*true\s*\)\s*\{/m.exec(code);
  if (!match) return code;
  const bodyStart = match.index + match[0].length;
  let depth = 1;
  let cursor = bodyStart;
  while (cursor < code.length && depth > 0) {
    if (code[cursor] === "{") depth++;
    if (code[cursor] === "}") depth--;
    cursor++;
  }
  if (depth !== 0) return code;
  const init = code.slice(0, match.index).trim();
  const loopBody = code.slice(bodyStart, cursor - 1).trim();
  const afterLoop = code.slice(cursor).trim();
  return [init, afterLoop, loopBody].filter(Boolean).join(";\n");
}

export function compileUserCode(body: string): (mcu: unknown) => void {
  return new Function("mcu", `"use strict";\n${body}`) as (mcu: unknown) => void;
}
