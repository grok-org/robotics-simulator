import { MOTOR_PINS, IR_PINS } from "@/types/vmc";
const VARIABLE_IDS = {
    IN1: "v1",
    IN2: "v2",
    IN3: "v3",
    IN4: "v4",
    IR1: "v5",
    IR2: "v6",
    status: "v7",
    distance: "v8",
} as const;
type VarKey = keyof typeof VARIABLE_IDS;
type MotorDuty = readonly [name: string, val: number];
const varName = (k: VarKey) => k;
const tag = (
    n: string,
    a: Record<string, string | number | undefined> = {},
    i = "",
) => {
    const as = Object.entries(a)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => ` ${k}="${v}"`)
        .join("");
    return `<${n}${as}>${i}</${n}>`;
};
const field = (n: string, v: string | number, id?: string) =>
    tag("field", { name: n, id }, String(v));
const value = (n: string, i: string) => tag("value", { name: n }, i);
const statement = (n: string, i: string) => tag("statement", { name: n }, i);
const mutation = (a: Record<string, string | number | undefined>) =>
    tag("mutation", a);
const block = (t: string, i = "", a: Record<string, string | number> = {}) =>
    tag("block", { type: t, ...a }, i);
const shadow = (t: string, i = "", a: Record<string, string | number> = {}) =>
    tag("shadow", { type: t, ...a }, i);
const chainNext = (b: string[]): string => {
    if (b.length <= 1) return b[0] || "";
    const [first, ...rest] = b;
    const tail = chainNext(rest);
    const i = first.lastIndexOf("</block>");
    return i === -1
        ? first + tail
        : first.slice(0, i) + tag("next", {}, tail) + first.slice(i);
};
const pinNum = (p: string | number) => block("pin_num", field("pin", p));
const vGet = (k: VarKey) =>
    block("variables_get", field("VAR", varName(k), VARIABLE_IDS[k]));
const vSet = (k: VarKey, val: string) =>
    block(
        "variables_set",
        field("VAR", varName(k), VARIABLE_IDS[k]) + value("VALUE", val),
    );
const mathNum = (n: number) => block("math_number", field("NUM", n));
const logicBool = (v: "TRUE" | "FALSE") =>
    block("logic_boolean", field("BOOL", v));
const inputBlock = (p: string | number) => block("input", field("PIN", p));
const useSensor = (n: string) => block("use_sensors", field("sensor", n));
const getDistance = () => block("get_distance");
const sleepBlock = (t: number) => block("sleep", field("TIME", t));
const textBlock = (t: string) => block("text", field("TEXT", t));
const procCall = (n: string) =>
    block("procedures_callnoreturn", mutation({ name: n }));
const isDataReceived = (k: string) =>
    block("is_data_received_from_mobile", field("key", k));
const readData = (k: string) => block("read_data_from_mobile", field("key", k));
const logicCompare = (o: string, a: string, b: string) =>
    block("logic_compare", field("OP", o) + value("A", a) + value("B", b));
const logicOp = (o: "AND" | "OR", a: string, b: string) =>
    block("logic_operation", field("OP", o) + value("A", a) + value("B", b));
const textJoin = (items: string[]) =>
    block(
        "text_join",
        mutation({ items: items.length }) +
            items.map((v, i) => value(`ADD${i}`, v)).join(""),
    );
const textPrint = (v: string) => block("text_print", value("TEXT", v));
const isStatus = (v: "TRUE" | "FALSE") =>
    logicCompare("EQ", vGet("status"), logicBool(v));
const controlsIf = (ifs: { c: string; s: string }[], els?: string) => {
    const hasEls = !!els;
    const elseifCount = Math.max(0, ifs.length - 1);
    let inner =
        elseifCount > 0 || hasEls
            ? mutation({
                  elseif: elseifCount || undefined,
                  else: hasEls ? 1 : undefined,
              })
            : "";
    ifs.forEach((f, i) => {
        inner += value(`IF${i}`, f.c) + statement(`DO${i}`, f.s);
    });
    if (hasEls) inner += statement("ELSE", els!);
    return block("controls_if", inner);
};
const whileLoop = (c: string, s: string) =>
    block(
        "controls_whileUntil",
        field("MODE", "WHILE") + value("BOOL", c) + statement("DO", s),
    );
const motorSetup = (
    n: number,
    k1: VarKey,
    p1: string | number,
    k2: VarKey,
    p2: string | number,
) =>
    block(
        "set_motor_as_speed_control_pin_at_gpio",
        field("input", n) +
            field("var1", varName(k1), VARIABLE_IDS[k1]) +
            field("var2", varName(k2), VARIABLE_IDS[k2]) +
            value("pin1", pinNum(p1)) +
            value("pin2", pinNum(p2)),
    );
const variables = (keys: VarKey[]) =>
    tag(
        "variables",
        {},
        keys
            .map((k) => tag("variable", { id: VARIABLE_IDS[k] }, varName(k)))
            .join(""),
    );
const duty = (k: VarKey, v: number): MotorDuty => [varName(k), v];
const buildProc = (
    name: string,
    x: number,
    y: number,
    duties: readonly MotorDuty[],
) => {
    const body = chainNext(
        duties.map(([nm, val]) =>
            block(
                "set_motor_speed_to",
                value("motorName", vGet(nm as VarKey)) +
                    value(
                        "speedLimit",
                        shadow(
                            "bounded_number_input_0_1024",
                            field("NUM", val),
                        ),
                    ),
            ),
        ),
    );
    return block(
        "procedures_defnoreturn",
        field("NAME", name) + statement("STACK", body),
        { x, y },
    );
};
const DUTIES = {
    forward: [
        duty("IN1", 800),
        duty("IN2", 0),
        duty("IN3", 800),
        duty("IN4", 0),
    ] as const,
    backward: [
        duty("IN1", 0),
        duty("IN2", 800),
        duty("IN3", 0),
        duty("IN4", 800),
    ] as const,
    left: [
        duty("IN1", 0),
        duty("IN2", 800),
        duty("IN3", 800),
        duty("IN4", 0),
    ] as const,
    right: [
        duty("IN1", 800),
        duty("IN2", 0),
        duty("IN3", 0),
        duty("IN4", 800),
    ] as const,
    stop: [
        duty("IN1", 0),
        duty("IN2", 0),
        duty("IN3", 0),
        duty("IN4", 0),
    ] as const,
};
const irCond = (ir1: number, ir2: number) =>
    logicOp(
        "AND",
        logicCompare("EQ", vGet("IR1"), mathNum(ir1)),
        logicCompare("EQ", vGet("IR2"), mathNum(ir2)),
    );
const irLogic = controlsIf([
    { c: irCond(1, 1), s: procCall("forward") },
    { c: irCond(1, 0), s: procCall("right") },
    { c: irCond(0, 1), s: procCall("left") },
    { c: irCond(0, 0), s: procCall("stop") },
]);
const defaultWhileBody = chainNext([
    vSet("IR1", inputBlock(IR_PINS.LEFT)),
    vSet("IR2", inputBlock(IR_PINS.RIGHT)),
    controlsIf([
        {
            c: isDataReceived("status"),
            s: chainNext([
                vSet("status", readData("status")),
                controlsIf([
                    { c: isStatus("TRUE"), s: irLogic },
                    { c: isStatus("FALSE"), s: procCall("stop") },
                ]),
            ]),
        },
    ]),
]);
const defaultTopBlocks = chainNext([
    block("run", "", { x: 30, y: 30 }),
    block("use_mobile_app"),
    useSensor("IR Sensor"),
    useSensor("Robotics"),
    motorSetup(1, "IN1", MOTOR_PINS.IN1, "IN2", MOTOR_PINS.IN2),
    motorSetup(2, "IN3", MOTOR_PINS.IN3, "IN4", MOTOR_PINS.IN4),
    whileLoop(logicBool("TRUE"), defaultWhileBody),
]);
const defaultProcs = [
    buildProc("forward", 750, 30, DUTIES.forward),
    buildProc("backward", 750, 280, DUTIES.backward),
    buildProc("left", 1050, 30, DUTIES.left),
    buildProc("right", 1050, 280, DUTIES.right),
    buildProc("stop", 1350, 30, DUTIES.stop),
].join("\n");
export const DEFAULT_BLOCKLY_XML = `<xml xmlns="https://developers.google.com/blockly/xml">
${variables(["IN1", "IN2", "IN3", "IN4", "IR1", "IR2", "status"])}
${defaultTopBlocks}
${defaultProcs}
</xml>`;
const distanceCheck = controlsIf(
    [
        {
            c: logicCompare("LT", getDistance(), mathNum(20)),
            s: procCall("stop"),
        },
        {
            c: logicCompare("GT", getDistance(), mathNum(40)),
            s: procCall("forward"),
        },
    ],
    chainNext([procCall("forward"), sleepBlock(0.2)]),
);
const obstacleTrueLogic = chainNext([
    vSet("distance", getDistance()),
    textPrint(textJoin([textBlock("Distance : "), vGet("distance")])),
    distanceCheck,
]);
const obstacleWhileBody = chainNext([
    controlsIf([
        { c: isDataReceived("status"), s: vSet("status", readData("status")) },
    ]),
    controlsIf(
        [{ c: isStatus("TRUE"), s: obstacleTrueLogic }],
        procCall("stop"),
    ),
]);
const obstacleTopBlocks = chainNext([
    block("run", "", { x: 90, y: 10 }),
    useSensor("Ultrasonic Sensor"),
    useSensor("Robotics"),
    useSensor("Time"),
    motorSetup(1, "IN1", 14, "IN2", 15),
    motorSetup(2, "IN3", 12, "IN4", 2),
    block(
        "ultrasonic_sensor",
        value("echo", pinNum(25)) + value("trigger", pinNum(26)),
    ),
    block("calculate_ultrasonic_distance"),
    whileLoop(logicBool("TRUE"), obstacleWhileBody),
]);
const obstacleProcs = [
    buildProc("forward", 610, 310, DUTIES.forward),
    buildProc("stop", 970, 310, DUTIES.stop),
].join("\n");
export const OBSTACLE_AVOIDANCE_BLOCKLY_XML = `<xml xmlns="https://developers.google.com/blockly/xml">
${variables(["IN1", "IN2", "IN3", "IN4", "status", "distance"])}
${obstacleTopBlocks}
${obstacleProcs}
</xml>`;
