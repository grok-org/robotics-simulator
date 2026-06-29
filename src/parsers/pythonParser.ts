import { parse, walk } from "py-ast";
import type {
  ASTNode,
  ASTNodeUnion,
  Assign,
  Call,
  FunctionDef,
  Module,
} from "py-ast";
import type {
  DutyAssignment,
  ExtractedConfig,
  MainLoopRule,
  MotorConfig,
  MotorMapping,
  Procedure,
  SensorConfig,
  SensorCondition,
} from "../types/vmc";
interface IfNode extends ASTNode {
  nodeType: "If";
  test: ASTNode;
  body: ASTNode[];
  orelse: ASTNode[];
}
interface WhileNode extends ASTNode {
  nodeType: "While";
  test: ASTNode;
  body: ASTNode[];
  orelse: ASTNode[];
}
const is = <T extends ASTNodeUnion>(
  n: ASTNode | undefined | null,
  t: T["nodeType"],
): n is T => !!n && n.nodeType === t;
function dottedName(node: ASTNode | undefined): string | null {
  if (!node) return null;
  if (is(node, "Name")) return (node as { id: string }).id;
  if (is(node, "Attribute")) {
    const a = node as { value: ASTNode; attr: string };
    const base = dottedName(a.value);
    return base ? `${base}.${a.attr}` : null;
  }
  return null;
}
const intArg = (n: ASTNode | undefined): number | null =>
  is(n, "Constant") && typeof (n as { value: unknown }).value === "number"
    ? Math.trunc((n as { value: number }).value)
    : null;
function* findCalls(
  root: ASTNode,
  predicate: (call: Call) => boolean,
): Generator<Call> {
  for (const node of walk(root as ASTNodeUnion)) {
    if (is(node, "Call") && predicate(node as Call)) yield node as Call;
  }
}
function extractMotors(module: Module): MotorConfig[] {
  const out: MotorConfig[] = [];
  for (const stmt of walk(module)) {
    if (!is(stmt, "Assign")) continue;
    const a = stmt as Assign;
    const target = a.targets[0];
    if (!is(target, "Name")) continue;
    if (!is(a.value, "Call")) continue;
    const call = a.value as Call;
    if (dottedName(call.func) !== "machine.PWM") continue;
    const pinCall = call.args[0];
    if (
      !is(pinCall, "Call") ||
      dottedName((pinCall as Call).func) !== "machine.Pin"
    )
      continue;
    const pin = intArg((pinCall as Call).args[0]);
    if (pin === null) continue;
    const freqKw = call.keywords.find((k) => k.arg === "freq");
    const freq = freqKw ? intArg(freqKw.value) ?? 0 : 0;
    out.push({ name: (target as { id: string }).id, pin, freq });
  }
  return out;
}
function extractSensors(module: Module): SensorConfig[] {
  const seen = new Set<number>();
  const out: SensorConfig[] = [];
  for (const node of walk(module)) {
    if (!is(node, "Call")) continue;
    const call = node as Call;
    if (dottedName(call.func)?.endsWith(".value") !== true) continue;
    const attr = call.func as { value: ASTNode };
    if (!is(attr.value, "Call")) continue;
    const inner = attr.value as Call;
    if (dottedName(inner.func) !== "machine.Pin") continue;
    const pin = intArg(inner.args[0]);
    if (pin === null || seen.has(pin)) continue;
    seen.add(pin);
    out.push({ name: `pin${pin}`, pin });
  }
  return out;
}
function extractProcedures(module: Module): Procedure[] {
  const out: Procedure[] = [];
  for (const stmt of module.body) {
    if (!is(stmt, "FunctionDef")) continue;
    const fn = stmt as FunctionDef;
    const duties: DutyAssignment[] = [];
    for (const call of findCalls(
      fn,
      (c) => dottedName(c.func)?.endsWith(".duty") === true,
    )) {
      const attr = call.func as { value: ASTNode };
      const motor = is(attr.value, "Name")
        ? (attr.value as { id: string }).id
        : null;
      const duty = intArg(call.args[0]);
      if (motor !== null && duty !== null) duties.push({ motor, duty });
    }
    out.push({ name: fn.name, duties });
  }
  return out;
}
function extractRules(module: Module): {
  rules: MainLoopRule[];
  fallback: string;
} {
  let rules: MainLoopRule[] = [];
  let fallback = "stop";
  const top = module.body.find(
    (s) => is(s, "While") && is((s as WhileNode).test, "Constant"),
  ) as WhileNode | undefined;
  if (!top) return { rules, fallback };

  for (const node of walk(top as unknown as ASTNodeUnion)) {
    if (!is(node, "If")) continue;
    const ifNode = node as IfNode;
    const conditions = parseConditions(ifNode.test);
    if (conditions.length === 0) continue;
    const expr = ifNode.body[0];
    if (!is(expr, "Expr")) continue;
    const call = (expr as { value: ASTNode }).value;
    if (!is(call, "Call")) continue;
    const procName = dottedName((call as Call).func);
    if (!procName) continue;
    rules.push({ conditions, procedure: procName });
    if (ifNode.orelse.length === 1 && is(ifNode.orelse[0], "Expr")) {
      const fbCall = (ifNode.orelse[0] as { value: ASTNode }).value;
      if (is(fbCall, "Call")) {
        const fb = dottedName((fbCall as Call).func);
        if (fb) fallback = fb;
      }
    }
  }
  const seen = new Set<string>();
  rules = rules.filter((r) => {
    const k = `${r.conditions.map((c) => `${c.sensor}=${c.value}`).join("&")}=>${r.procedure}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { rules, fallback };
}
function parseConditions(node: ASTNode): SensorCondition[] {
  if (is(node, "BoolOp")) {
    const b = node as { op: { nodeType: string }; values: ASTNode[] };
    if (b.op.nodeType !== "And") return [];
    return b.values.flatMap(parseConditions);
  }
  if (is(node, "Compare")) {
    const c = node as {
      left: ASTNode;
      ops: { nodeType: string }[];
      comparators: ASTNode[];
    };
    if (c.ops[0]?.nodeType !== "Eq") return [];
    const sensor = is(c.left, "Name")
      ? (c.left as { id: string }).id
      : null;
    const v = intArg(c.comparators[0]);
    return sensor !== null && v !== null ? [{ sensor, value: v }] : [];
  }
  return [];
}
function inferMapping(motors: MotorConfig[]): MotorMapping {
  const by = new Set(motors.map((m) => m.name));
  const pick = (preferred: string, fallbackIdx: number) =>
    by.has(preferred) ? preferred : motors[fallbackIdx]?.name ?? preferred;
  return {
    left: { forward: pick("IN1", 0), backward: pick("IN2", 1) },
    right: { forward: pick("IN3", 2), backward: pick("IN4", 3) },
  };
}
function maxDuty(procs: Procedure[]): number {
  let max = 0;
  for (const p of procs)
    for (const d of p.duties) if (d.duty > max) max = d.duty;
  return max;
}
export function parsePythonCode(code: string): ExtractedConfig | null {
  try {
    const module = parse(code) as Module;
    const motors = extractMotors(module);
    const sensors = extractSensors(module);
    const procedures = extractProcedures(module);
    const { rules: mainLoopRules, fallback: fallbackProcedure } =
      extractRules(module);
    return {
      motors,
      sensors,
      procedures,
      mainLoopRules,
      fallbackProcedure,
      motorMapping: inferMapping(motors),
      maxDuty: maxDuty(procedures),
    };
  } catch {
    return null;
  }
}
