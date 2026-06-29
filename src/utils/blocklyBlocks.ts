import * as Blockly from "blockly";
import "blockly/blocks";
import { javascriptGenerator, Order as JsOrder } from "blockly/javascript";
import { pythonGenerator, Order as PyOrder } from "blockly/python";
import { MCU_METHODS } from "@/types/vmc";
type PyGen = typeof pythonGenerator;
type JsGen = typeof javascriptGenerator;
type Alignment = "LEFT" | "RIGHT" | "CENTRE";
type DropdownOption = [string, string];
type BlockArg =
    | {
        type: "field_number";
        name: string;
        value: number;
        min?: number;
        max?: number;
    }
    | { type: "field_dropdown"; name: string; options: DropdownOption[] }
    | { type: "field_input"; name: string; text: string }
    | { type: "field_variable"; name: string; variable: string }
    | { type: "input_value"; name: string; align?: Alignment; check?: string }
    | { type: "input_dummy"; align?: Alignment };
const arg = {
    number: (name: string, value: number, min?: number): BlockArg =>
        min === undefined
            ? { type: "field_number", name, value }
            : { type: "field_number", name, value, min },
    dropdown: (name: string, options: DropdownOption[]): BlockArg => ({
        type: "field_dropdown",
        name,
        options,
    }),
    textInput: (name: string, text: string): BlockArg => ({
        type: "field_input",
        name,
        text,
    }),
    variable: (name: string, variable: string): BlockArg => ({
        type: "field_variable",
        name,
        variable,
    }),
    valueInput: (name: string, check?: string, align?: Alignment): BlockArg => {
        const base: BlockArg = { type: "input_value", name };
        if (check) (base as { check: string }).check = check;
        if (align) (base as { align: Alignment }).align = align;
        return base;
    },
    dummyInput: (align?: Alignment): BlockArg =>
        align === undefined
            ? { type: "input_dummy" }
            : { type: "input_dummy", align },
};
interface BlockSpec {
    type: string;
    message0: string;
    args0?: BlockArg[];
    output?: string | null;
    previousStatement?: boolean;
    nextStatement?: boolean;
    inputsInline?: boolean;
    colour: string;
    py?: (block: Blockly.Block, gen: PyGen) => string | [string, PyOrder];
    js?: (block: Blockly.Block, gen: JsGen) => string | [string, JsOrder];
}
const STATEMENT_BLOCK = {
    previousStatement: true,
    nextStatement: true,
} as const;
const INLINE_STATEMENT_BLOCK = {
    inputsInline: true,
    previousStatement: true,
    nextStatement: true,
} as const;
const callMcu = (method: keyof typeof MCU_METHODS, ...args: string[]): string =>
    `mcu.${MCU_METHODS[method]}(${args.join(", ")})`;
const PY = "machine";
const nl = (s: string): string => `${s}\n`;
const py = {
    pinInit: (pin: string, mode: string): string =>
        nl(`${PY}.Pin(${pin}, ${PY}.Pin.${mode})`),
    pinRead: (pin: string): string => `${PY}.Pin(${pin}, ${PY}.Pin.IN).value()`,
    setValue: (variable: string, value: string): string =>
        nl(`${variable}.value(${value})`),
    pwmInit: (variable: string, pin: string): string =>
        nl(`${variable} = ${PY}.PWM(${PY}.Pin(${pin}), freq=100)`),
    duty: (variable: string, value: string): string =>
        nl(`${variable}.duty(${value})`),
    assign: (variable: string, expression: string): string =>
        nl(`${variable} = ${expression}`),
};
const js = {
    pinInit: (pin: string, mode: string): string =>
        nl(callMcu("writePin", pin, `'${mode}'`)),
    pinRead: (pin: string): string => callMcu("readPin", pin),
    pwmInit: (variable: string, pin: string): string =>
        js.assign(variable, callMcu("createPWM", pin, "100")),
    duty: (variable: string, value: string): string =>
        nl(`${variable}.duty(${value});`),
    assign: (variable: string, expression: string): string =>
        nl(`${variable} = ${expression};`),
};
const fieldValue =
    (name: string) =>
        (block: Blockly.Block): string =>
            String(block.getFieldValue(name));
const pyValue =
    (name: string, order: PyOrder, fallback = "0") =>
        (block: Blockly.Block, gen: PyGen): string =>
            gen.valueToCode(block, name, order) || fallback;
const jsValue =
    (name: string, order: JsOrder, fallback = "0") =>
        (block: Blockly.Block, gen: JsGen): string =>
            gen.valueToCode(block, name, order) || fallback;
const resolveVariableName =
    (name: string) =>
        (block: Blockly.Block, gen: PyGen | JsGen): string => {
            const id = block.getFieldValue(name);
            try {
                const generated = gen.getVariableName(id);
                if (generated) return generated;
            } catch { }
            const field = block.getField(name) as { getText?: () => string } | null;
            return field?.getText?.() ?? id;
        };
type CoderPair<Out> = {
    py: (block: Blockly.Block, gen: PyGen) => Out;
    js: (block: Blockly.Block, gen: JsGen) => Out;
};
const createPinInitCoders = (
    mode: string,
    variableFallback = "motor",
): CoderPair<string> => {
    const variable = pyValue("pinVariable", PyOrder.ATOMIC, variableFallback);
    const pin = pyValue("pin", PyOrder.NONE);
    const jsVariable = jsValue("pinVariable", JsOrder.ATOMIC, variableFallback);
    const jsPin = jsValue("pin", JsOrder.ATOMIC);
    return {
        py: (block, gen) =>
            py.assign(
                variable(block, gen),
                `${PY}.Pin(${pin(block, gen)}, ${PY}.Pin.${mode})`,
            ),
        js: (block, gen) =>
            js.assign(
                jsVariable(block, gen),
                callMcu("createPin", jsPin(block, gen), `'${mode}'`),
            ),
    };
};
const createToggleCoders = (
    pyFallback = "0",
    jsFallback = "motor",
): CoderPair<string> => {
    const pyVariable = pyValue("pinVariable", PyOrder.ATOMIC, pyFallback);
    const jsVariable = jsValue("pinVariable", JsOrder.ATOMIC, jsFallback);
    const onState = (b: Blockly.Block): "1" | "0" =>
        fieldValue("toggle")(b) === "on" ? "1" : "0";
    return {
        py: (block, gen) =>
            nl(`${pyVariable(block, gen)}.value(${onState(block)})`),
        js: (block, gen) =>
            nl(callMcu("togglePin", jsVariable(block, gen), onState(block))),
    };
};
const createMotorPairCoders = (
    buildPy: (v1: string, p1: string, v2: string, p2: string) => string,
    buildJs: (
        v1: string,
        p1: string,
        v2: string,
        p2: string,
        role: string,
    ) => string,
): CoderPair<string> => {
    const v1Name = resolveVariableName("var1");
    const v2Name = resolveVariableName("var2");
    const pyPin1 = pyValue("pin1", PyOrder.ATOMIC);
    const pyPin2 = pyValue("pin2", PyOrder.ATOMIC);
    const jsPin1 = jsValue("pin1", JsOrder.ATOMIC);
    const jsPin2 = jsValue("pin2", JsOrder.ATOMIC);
    return {
        py: (block, gen) =>
            buildPy(
                v1Name(block, gen),
                pyPin1(block, gen),
                v2Name(block, gen),
                pyPin2(block, gen),
            ),
        js: (block, gen) => {
            const role =
                fieldValue("input")(block) === "1" ? "'left'" : "'right'";
            return buildJs(
                v1Name(block, gen),
                jsPin1(block, gen),
                v2Name(block, gen),
                jsPin2(block, gen),
                role,
            );
        },
    };
};
const SENSOR_IMPORTS: Record<string, string> = {
    ...Object.fromEntries(
        [
            "Alcohol Sensor",
            "Button",
            "Buzzer",
            "IR Sensor",
            "LDR Sensor",
            "Ultrasonic Sensor",
            "Motor",
            "Robotics",
        ].map((machineCode) => [machineCode, "import machine\n"]),
    ),
    "Compass Sensor": "import HMC5883L\n",
    "MPU6050 Sensor": "import MPU6050\n",
    Time: "import time\n",
};
const SENSOR_OPTIONS: DropdownOption[] = Object.keys(SENSOR_IMPORTS).map(
    (n) => [n, n],
);
const PIN_OPTIONS: DropdownOption[] = Array.from({ length: 41 }, (_, i) => [
    String(i),
    String(i),
]);
const AXIS_OPTIONS: DropdownOption[] = [
    ["X", "[0]"],
    ["Y", "[1]"],
    ["Z", "[2]"],
];
const ON_OFF_OPTIONS: DropdownOption[] = [
    ["On", "on"],
    ["Off", "off"],
];
const ULTRASONIC_DISTANCE_FUNCTION =
    `def calculate_distance(echo_pin,trigger_pin):\n` +
    `\ttrigger_pin.off()\n` +
    `\ttime.sleep_ms(50)\n` +
    `\ttrigger_pin.on()\n` +
    `\ttime.sleep_us(10)\n` +
    `\ttrigger_pin.off()\n` +
    `\ttimeout_start = time.ticks_us()\n` +
    `\twhile echo_pin.value() == 0:\n` +
    `\t\tif time.ticks_diff(time.ticks_us(), timeout_start) > 40000:\n` +
    `\t\t\treturn 0\n` +
    `\tpulse_start = time.ticks_us()\n` +
    `\ttimeout_start = time.ticks_us()\n` +
    `\twhile echo_pin.value() == 1:\n` +
    `\t\tif time.ticks_diff(time.ticks_us(), timeout_start) > 40000:\n` +
    `\t\t\treturn 0\n` +
    `\tpulse_end = time.ticks_us()\n` +
    `\tmeasuredTime = time.ticks_diff(pulse_end, pulse_start)\n` +
    `\tdistance = (measuredTime * 0.0343) / 2\n` +
    `\treturn round(distance, 2)\n`;
const MOTOR_PAIR_ARGS: BlockArg[] = [
    arg.number("input", 1),
    arg.dummyInput(),
    arg.variable("var1", "IN1"),
    arg.valueInput("pin1", undefined, "RIGHT"),
    arg.variable("var2", "IN2"),
    arg.valueInput("pin2", undefined, "RIGHT"),
];
const BLOCK_SPECS: BlockSpec[] = [
    {
        type: "run",
        message0: "Start",
        nextStatement: true,
        colour: "#935ba5",
        py: () => "",
        js: () => "",
    },
    {
        type: "exit",
        message0: "Exit program",
        previousStatement: true,
        colour: "#935ba5",
        py: () => "exit()\n",
        js: () => `${callMcu("exitProgram")};\n`,
    },
    {
        type: "use_sensors",
        message0: "Use %1",
        args0: [arg.dropdown("sensor", SENSOR_OPTIONS)],
        ...STATEMENT_BLOCK,
        colour: "#935ba5",
        py: (b) =>
            SENSOR_IMPORTS[fieldValue("sensor")(b)] ?? "import machine\n",
        js: (b) =>
            `${callMcu("importSensors", `"${fieldValue("sensor")(b)}"`)};\n`,
    },
    {
        type: "input",
        message0: "Get input from pin %1",
        args0: [arg.number("PIN", 0, 0)],
        output: null,
        inputsInline: true,
        colour: "#935ba5",
        py: (b) => [py.pinRead(fieldValue("PIN")(b)), PyOrder.NONE],
        js: (b) => [js.pinRead(fieldValue("PIN")(b)), JsOrder.ATOMIC],
    },
    {
        type: "pin_num",
        message0: "%1",
        args0: [arg.dropdown("pin", PIN_OPTIONS)],
        output: null,
        colour: "#935ba5",
        py: (b) => [fieldValue("pin")(b), PyOrder.NONE],
        js: (b) => [fieldValue("pin")(b), JsOrder.ATOMIC],
    },
    {
        type: "sleep",
        message0: "Pause for %1 second(s)",
        args0: [arg.number("TIME", 1, 0)],
        ...STATEMENT_BLOCK,
        inputsInline: true,
        colour: "#935ba5",
        py: (b) => `time.sleep(${fieldValue("TIME")(b)})\n`,
        js: (b) => `${callMcu("sleep", fieldValue("TIME")(b))};\n`,
    },
    {
        type: "sleep_input",
        message0: "Pause for %1 Second(s)",
        args0: [arg.valueInput("DELAY", "Number")],
        ...STATEMENT_BLOCK,
        colour: "#935ba5",
        py: (b, g) => `time.sleep(${pyValue("DELAY", PyOrder.NONE)(b, g)})\n`,
        js: (b, g) =>
            `${callMcu("sleep", jsValue("DELAY", JsOrder.ATOMIC)(b, g))};\n`,
    },
    {
        type: "use_mobile_app",
        message0: "Connect to mobile",
        ...STATEMENT_BLOCK,
        colour: "#FF4848",
        py: () => "import GrokESPLib\n",
        js: () => `${callMcu("useMobileApp")};\n`,
    },
    {
        type: "check_msg",
        message0: "Check Message",
        ...STATEMENT_BLOCK,
        colour: "#FF4848",
        py: () => "GrokESPLib.check_msg()\n",
        js: () => `${callMcu("checkMsg")};\n`,
    },
    {
        type: "is_data_received_from_mobile",
        message0: "is data received from mobile for %1",
        args0: [arg.textInput("key", "status")],
        output: "Boolean",
        colour: "#FF4848",
        py: (b) => [
            `"${fieldValue("key")(b)}" in GrokESPLib.iot_sensor_status["data"]`,
            PyOrder.NONE,
        ],
        js: (b) => [
            callMcu("hasData", `"${fieldValue("key")(b)}"`),
            JsOrder.ATOMIC,
        ],
    },
    {
        type: "read_data_from_mobile",
        message0: "Read data from mobile for %1",
        args0: [arg.textInput("key", "status")],
        output: null,
        colour: "#FF4848",
        py: (b) => [
            `GrokESPLib.iot_sensor_status["data"]["${fieldValue("key")(b)}"]`,
            PyOrder.NONE,
        ],
        js: (b) => [
            callMcu("readData", `"${fieldValue("key")(b)}"`),
            JsOrder.ATOMIC,
        ],
    },
    {
        type: "buzzer",
        message0: "Set Buzzer %1 as output at pin  %2",
        args0: [
            arg.variable("BUZZER_VAR", "buzzer_pin"),
            arg.valueInput("pin", undefined, "RIGHT"),
        ],
        ...INLINE_STATEMENT_BLOCK,
        colour: "#197419",
        py: (b, g) => {
            const pin = pyValue("pin", PyOrder.ATOMIC)(b, g);
            const name = resolveVariableName("BUZZER_VAR")(b, g);
            return py.assign(name, `${PY}.Pin(${pin}, ${PY}.Pin.OUT)`);
        },
        js: (b, g) => {
            const pin = jsValue("pin", JsOrder.ATOMIC)(b, g);
            const name = resolveVariableName("BUZZER_VAR")(b, g);
            return js.assign(name, callMcu("createPin", pin, "'OUT'"));
        },
    },
    {
        type: "buzzer_toggle",
        message0: "Turn %1 Buzzer at %2",
        args0: [
            arg.dropdown("toggle", ON_OFF_OPTIONS),
            arg.variable("BUZZER_VAR", "buzzer_pin"),
        ],
        ...INLINE_STATEMENT_BLOCK,
        colour: "#197419",
        py: (b, g) => {
            const state = fieldValue("toggle")(b);
            const name = resolveVariableName("BUZZER_VAR")(b, g);
            return `${name}.${state}()\n`;
        },
        js: (b, g) => {
            const state = fieldValue("toggle")(b);
            const name = resolveVariableName("BUZZER_VAR")(b, g);
            return nl(callMcu("togglePin", name, state === "on" ? "1" : "0"));
        },
    },
    {
        type: "buzzer_var",
        message0: "Set Buzzer %1 as Output at Pin %2",
        args0: [arg.valueInput("pinVariable"), arg.valueInput("pin")],
        ...STATEMENT_BLOCK,
        colour: "#197419",
        ...createPinInitCoders("OUT", "buzzer"),
    },
    {
        type: "buzzer_toggle_var",
        message0: "Turn %1 Buzzer %2",
        args0: [
            arg.dropdown("toggle", ON_OFF_OPTIONS),
            arg.valueInput("pinVariable"),
        ],
        ...INLINE_STATEMENT_BLOCK,
        colour: "#197419",
        ...createToggleCoders("0", "buzzer"),
    },
    {
        type: "ir_sensor",
        message0: "Set IR Sensor as input at pin %1",
        args0: [arg.valueInput("pin", undefined, "RIGHT")],
        ...INLINE_STATEMENT_BLOCK,
        colour: "#5c5ffa",
        py: (b, g) => py.pinInit(pyValue("pin", PyOrder.ATOMIC)(b, g), "IN"),
        js: (b, g) => js.pinInit(jsValue("pin", JsOrder.ATOMIC)(b, g), "IN"),
    },
    {
        type: "get_ir_sensor_value",
        message0: "Get IR Sensor Value from Pin %1",
        args0: [arg.valueInput("pin")],
        output: null,
        colour: "#5c5ffa",
        py: (b, g) => [
            py.pinRead(pyValue("pin", PyOrder.NONE)(b, g)),
            PyOrder.FUNCTION_CALL,
        ],
        js: (b, g) => [
            js.pinRead(jsValue("pin", JsOrder.ATOMIC)(b, g)),
            JsOrder.ATOMIC,
        ],
    },
    {
        type: "motor_var",
        message0: "Set Motor %1 as Output at Pin %2",
        args0: [arg.valueInput("pinVariable"), arg.valueInput("pin")],
        ...STATEMENT_BLOCK,
        colour: "#a55b6d",
        ...createPinInitCoders("OUT", "motor"),
    },
    {
        type: "motor_toggle_var",
        message0: "Turn %1 Motor %2",
        args0: [
            arg.dropdown("toggle", ON_OFF_OPTIONS),
            arg.valueInput("pinVariable"),
        ],
        ...INLINE_STATEMENT_BLOCK,
        colour: "#a55b6d",
        ...createToggleCoders("0", "motor"),
    },
    {
        type: "set_motor_pin_toggle_var",
        message0: "Set %2 Pin %1",
        args0: [
            arg.dropdown("toggle", ON_OFF_OPTIONS),
            arg.valueInput("pinVariable"),
        ],
        ...INLINE_STATEMENT_BLOCK,
        colour: "#d5240e",
        ...createToggleCoders("0", "motor"),
    },
    {
        type: "set_as_speed_control_pin_at_gpio",
        message0: "Set %1 as Speed Control Pin at GPIO %2",
        args0: [arg.valueInput("pin"), arg.valueInput("pinVariable")],
        ...STATEMENT_BLOCK,
        inputsInline: true,
        colour: "#d5240e",
        py: (b, g) =>
            py.assign(
                pyValue("pin", PyOrder.NONE)(b, g),
                `machine.PWM(machine.Pin(${pyValue("pinVariable", PyOrder.ATOMIC, "pwm_var")(b, g)}), freq=100)`,
            ),
        js: (b, g) =>
            js.assign(
                jsValue("pinVariable", JsOrder.ATOMIC, "pwm_var")(b, g),
                callMcu(
                    "createPWM",
                    jsValue("pin", JsOrder.ATOMIC)(b, g),
                    "100",
                ),
            ),
    },
    {
        type: "set_motor_as_speed_control_pin_at_gpio",
        message0:
            "Set motor %1 %2 %3 as Speed Control Pin at GPIO %4 %5 as Speed Control Pin at GPIO %6",
        args0: MOTOR_PAIR_ARGS,
        ...STATEMENT_BLOCK,
        inputsInline: false,
        colour: "#d5240e",
        ...createMotorPairCoders(
            (v1, p1, v2, p2) => py.pwmInit(v1, p1) + py.pwmInit(v2, p2),
            (v1, p1, v2, p2, role) =>
                js.pwmInit(v1, p1) +
                js.pwmInit(v2, p2) +
                `${callMcu("configureMotorPair", role, p1, p2)};\n`,
        ),
    },
    {
        type: "set_motor_n_speed_to",
        message0: "Set motor %1 %2 %3 speed to %4 %5 speed to %6",
        args0: MOTOR_PAIR_ARGS,
        ...STATEMENT_BLOCK,
        inputsInline: false,
        colour: "#d5240e",
        ...createMotorPairCoders(
            (v1, p1, v2, p2) => py.duty(v1, p1) + py.duty(v2, p2),
            (v1, p1, v2, p2) => js.duty(v1, p1) + js.duty(v2, p2),
        ),
    },
    {
        type: "set_motor_speed_to",
        message0: "Set Motor %1 Speed to %2",
        args0: [
            arg.valueInput("motorName"),
            arg.valueInput("speedLimit", "Number"),
        ],
        ...STATEMENT_BLOCK,
        inputsInline: true,
        colour: "#d5240e",
        py: (b, g) =>
            py.duty(
                pyValue("motorName", PyOrder.ATOMIC, "motor")(b, g),
                pyValue("speedLimit", PyOrder.NONE, "50")(b, g),
            ),
        js: (b, g) =>
            js.duty(
                jsValue("motorName", JsOrder.ATOMIC, "motor")(b, g),
                jsValue("speedLimit", JsOrder.ATOMIC, "50")(b, g),
            ),
    },
    {
        type: "set_motor_output_pin_at_gpio",
        message0: "Set %1 as Output Pin at GPIO %2",
        args0: [arg.valueInput("pinVariable"), arg.valueInput("pin")],
        ...STATEMENT_BLOCK,
        inputsInline: true,
        colour: "#d5240e",
        ...createPinInitCoders("OUT", "motor"),
    },
    {
        type: "bounded_number_input_0_1024",
        message0: "%1",
        args0: [
            {
                type: "field_number",
                name: "NUM",
                value: 0,
                min: 0,
                max: 1024,
            },
        ],
        output: "Number",
        colour: "#1bc221",
        py: (b) => [fieldValue("NUM")(b), PyOrder.ATOMIC],
        js: (b) => [fieldValue("NUM")(b), JsOrder.ATOMIC],
    },
    {
        type: "initialize_mpu6050_sensor",
        message0: "Read MPU6050 Data with %1 pin",
        args0: [arg.valueInput("pin")],
        ...STATEMENT_BLOCK,
        colour: "#5b80a5",
        py: (b, g) => `MPU6050.init(${pyValue("pin", PyOrder.ATOMIC)(b, g)})\n`,
        js: (b, g) =>
            `${callMcu("setupMPU", jsValue("pin", JsOrder.ATOMIC)(b, g))};\n`,
    },
    {
        type: "read_acceleration_in_axis",
        message0: "Read acceleration in %1",
        args0: [arg.dropdown("axis", AXIS_OPTIONS)],
        output: null,
        colour: "#5b80a5",
        py: (b) => [
            `MPU6050.read_mpu6050()[0]${fieldValue("axis")(b)}`,
            PyOrder.MEMBER,
        ],
        js: (b) => [
            `${callMcu("readMPUAccel")}${fieldValue("axis")(b)}`,
            JsOrder.ATOMIC,
        ],
    },
    {
        type: "read_gyro_in_axis",
        message0: "Read gyro in %1",
        args0: [arg.dropdown("gyro", AXIS_OPTIONS)],
        output: null,
        colour: "#5b80a5",
        py: (b) => [
            `MPU6050.read_mpu6050()[1]${fieldValue("gyro")(b)}`,
            PyOrder.MEMBER,
        ],
        js: (b) => [
            `${callMcu("readMPUGyro")}${fieldValue("gyro")(b)}`,
            JsOrder.ATOMIC,
        ],
    },
    {
        type: "read_axis",
        message0: "%1 - Axis",
        args0: [arg.dropdown("axis", AXIS_OPTIONS)],
        output: null,
        colour: "#ce897b",
        py: (b) => [
            `HMC5883L.read_hmc5883l()${fieldValue("axis")(b)}`,
            PyOrder.FUNCTION_CALL,
        ],
        js: (b) => [
            `${callMcu("readHMC5883L")}${fieldValue("axis")(b)}`,
            JsOrder.ATOMIC,
        ],
    },
    {
        type: "get_rfid",
        message0: "Get RFID",
        output: null,
        colour: "#8ab912",
        py: () => ["nfc.read_uid()", PyOrder.FUNCTION_CALL],
        js: () => [callMcu("readRFID"), JsOrder.ATOMIC],
    },
    {
        type: "ultrasonic_sensor",
        message0:
            "Set Ultrasonic Sensor as %1 Echo Input at Pin %2 Trigger Output at Pin %3",
        args0: [
            arg.dummyInput(),
            arg.valueInput("echo", undefined, "RIGHT"),
            arg.valueInput("trigger", undefined, "RIGHT"),
        ],
        ...STATEMENT_BLOCK,
        inputsInline: false,
        colour: "#3792cb",
        py: (b, g) =>
            `echo_pin = ${py.pinInit(pyValue("echo", PyOrder.ATOMIC)(b, g), "IN")}` +
            `trigger_pin = ${py.pinInit(pyValue("trigger", PyOrder.ATOMIC)(b, g), "OUT")}`,
        js: (b, g) =>
            js.pinInit(jsValue("echo", JsOrder.ATOMIC)(b, g), "IN") +
            js.pinInit(jsValue("trigger", JsOrder.ATOMIC)(b, g), "OUT"),
    },
    {
        type: "get_distance",
        message0: "Get Distance TRIG %1 ECHO %2",
        args0: [arg.number("TRIG", 26, 0), arg.number("ECHO", 25, 0)],
        output: null,
        inputsInline: true,
        colour: "#3792cb",
        py: () => ["calculate_distance(echo_pin, trigger_pin)", PyOrder.FUNCTION_CALL],
        js: (b) => [
            callMcu("readUltrasonic", fieldValue("TRIG")(b), fieldValue("ECHO")(b)),
            JsOrder.ATOMIC,
        ],
    },
    {
        type: "calculate_ultrasonic_distance",
        message0: "Calculate Distance (Logic)",
        ...STATEMENT_BLOCK,
        colour: "#3792cb",
        py: () => ULTRASONIC_DISTANCE_FUNCTION,
        js: () => "",
    },
];

function registerForBlock<G extends PyGen | JsGen>(
    generator: G,
    type: string,
    handler: (block: Blockly.Block, gen: G) => unknown,
): void {
    (generator.forBlock as Record<string, unknown>)[type] = handler as never;
}
let isRegistered = false;
const specToJson = (spec: BlockSpec): Record<string, unknown> => {
    const json: Record<string, unknown> = {
        type: spec.type,
        message0: spec.message0,
        colour: spec.colour,
    };
    if (spec.args0) json.args0 = spec.args0;
    if (spec.output !== undefined) json.output = spec.output;
    if (spec.previousStatement) json.previousStatement = null;
    if (spec.nextStatement) json.nextStatement = null;
    if (spec.inputsInline) json.inputsInline = true;
    return json;
};
export function registerCustomBlocks(): void {
    if (isRegistered) return;
    isRegistered = true;
    Blockly.defineBlocksWithJsonArray(BLOCK_SPECS.map(specToJson));
    for (const spec of BLOCK_SPECS) {
        if (spec.py) registerForBlock(pythonGenerator, spec.type, spec.py);
        if (spec.js) registerForBlock(javascriptGenerator, spec.type, spec.js);
    }

    javascriptGenerator.forBlock["text_print"] = function (block) {
        const msg = javascriptGenerator.valueToCode(block, "TEXT", JsOrder.NONE) || "''";
        return `${callMcu("printLog", `String(${msg})`)};\n`;
    };
}
export function getPythonGen(): typeof pythonGenerator {
    return pythonGenerator;
}
export function getJsGen(): typeof javascriptGenerator {
    return javascriptGenerator;
}
type Shadow = {
    kind: "shadow";
    type: string;
    fields?: Record<string, unknown>;
};
type ToolboxNode =
    | {
        kind: "category";
        name: string;
        colour: string;
        contents?: ToolboxNode[];
        custom?: "VARIABLE" | "PROCEDURE";
    }
    | {
        kind: "block";
        type: string;
        fields?: Record<string, unknown>;
        inputs?: Record<string, { shadow: Shadow }>;
    };
const category = (
    name: string,
    colour: string,
    contents?: ToolboxNode[],
    custom?: "VARIABLE" | "PROCEDURE",
): ToolboxNode =>
    custom
        ? { kind: "category", name, colour, custom }
        : { kind: "category", name, colour, contents };
const block = (
    type: string,
    fields?: Record<string, unknown>,
    inputs?: Record<string, { shadow: Shadow }>,
): ToolboxNode => {
    const node: ToolboxNode = { kind: "block", type };
    if (fields) (node as { fields: Record<string, unknown> }).fields = fields;
    if (inputs)
        (node as { inputs: Record<string, { shadow: Shadow }> }).inputs =
            inputs;
    return node;
};
const shadowOf = (type: string, fields: Record<string, unknown>): Shadow => ({
    kind: "shadow",
    type,
    fields,
});
export type Toolbox = { kind: "categoryToolbox"; contents: ToolboxNode[] };
export function getToolbox(): Toolbox {
    return {
        kind: "categoryToolbox",
        contents: [
            category("Functions", "#FF6680", undefined, "PROCEDURE"),
            category("Logic", "#4C97FF", [
                block("controls_if"),
                block("logic_compare", { OP: "EQ" }),
                block("logic_operation", { OP: "AND" }),
                block("logic_negate"),
                block("logic_boolean", { BOOL: "TRUE" }),
                block("logic_null"),
            ]),
            category("Mobile", "#FF4848", [
                block("use_mobile_app"),
                block("check_msg"),
                block("is_data_received_from_mobile"),
                block("read_data_from_mobile"),
            ]),
            category("Loops", "#0fBD8C", [
                block("controls_whileUntil", { MODE: "WHILE" }),
                block("controls_repeat_ext", undefined, {
                    TIMES: { shadow: shadowOf("math_number", { NUM: 5 }) },
                }),
                block("controls_flow_statements", { FLOW: "BREAK" }),
            ]),
            category("Math", "#59C059", [
                block("math_number", { NUM: 0 }),
                block(
                    "math_arithmetic",
                    { OP: "ADD" },
                    {
                        A: { shadow: shadowOf("math_number", { NUM: 1 }) },
                        B: { shadow: shadowOf("math_number", { NUM: 1 }) },
                    },
                ),
                block("math_round", { OP: "ROUND" }),
                block("math_modulo"),
                block("math_random_int"),
            ]),
            category("Text", "#FFBF00", [
                block("text"),
                block("text_join"),
                block("text_length"),
                block("text_print"),
            ]),
            category("Variables", "#FF8C1A", undefined, "VARIABLE"),
            category("Common Actions-ESP32", "#935ba5", [
                block("use_sensors"),
                block("run"),
                block("exit"),
                block("input"),
                block("pin_num"),
                block("sleep"),
                block("sleep_input"),
            ]),
            category("Sensors-ESP32", "#45b6fe", [
                category("Buzzer", "#197419", [
                    block("buzzer"),
                    block("buzzer_toggle"),
                    block("buzzer_var"),
                    block("buzzer_toggle_var"),
                ]),
                category("Compass Sensor", "#ce897b", [block("read_axis")]),
                category("IR Sensor", "#5c5ffa", [
                    block("ir_sensor"),
                    block("get_ir_sensor_value"),
                ]),
                category("Motor Controller", "#a55b6d", [
                    block("motor_var"),
                    block("motor_toggle_var"),
                ]),
                category("Motor Controller with Speed", "#d5240e", [
                    block("set_as_speed_control_pin_at_gpio"),
                    block("set_motor_speed_to", undefined, {
                        speedLimit: {
                            shadow: shadowOf("bounded_number_input_0_1024", {
                                NUM: 50,
                            }),
                        },
                    }),
                    block("set_motor_output_pin_at_gpio"),
                    block("set_motor_pin_toggle_var"),
                    block("set_motor_as_speed_control_pin_at_gpio"),
                    block("set_motor_n_speed_to"),
                ]),
                category("MPU6050 Sensor", "#5b80a5", [
                    block("initialize_mpu6050_sensor"),
                    block("read_acceleration_in_axis"),
                    block("read_gyro_in_axis"),
                ]),
                category("RFID", "#8ab912", [block("get_rfid")]),
                category("Ultrasonic Sensor", "#3792cb", [
                    block("ultrasonic_sensor"),
                    block("calculate_ultrasonic_distance"),
                    block("get_distance"),
                ]),
            ]),
        ],
    };
}
