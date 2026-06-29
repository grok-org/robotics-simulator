
---

# Robotics Simulator

A browser-based simulator for a esp bot. User write firmware in Blockly; the simulator compiles it to JavaScript and runs it against a Rapier2D physics world with simulated IR line sensors and ultrasonic distance sensing.

---

## Prerequisites

Ensure your local development environment meets the following specifications:

* **Node.js:** `v22.13.0` (as specified in `.npmrc` and `package.json`)
* **Package Manager:** `pnpm v11.1.1+`

---

## Quick Start

### 1. Environment Setup

If you do not have `pnpm` installed, use the built-in Node.js Corepack utility to configure it automatically:

```bash
npm install -g corepack@latest
corepack enable
corepack prepare pnpm@11.1.1 --activate

```

### 2. Development Commands

```bash
pnpm install   # Setup dependencies
pnpm dev       # Start dev server
pnpm build     # Generate prod build

```

---

## Architecture Flow

```text
+---------------------------------------+
|     User Firmware (Blockly -> JS)     |
+---------------------------------------+
                    |
                    v
+---------------------------------------+
|             McuApi (HAL)              |
+---------------------------------------+
                    |
                    v
+---------------------------------------+
|       Physics State Evaluation        |
+---------------------------------------+
                    |
                    v
+---------------------------------------+
|            Rapier2D World             |
+---------------------------------------+
                    |
                    v
+---------------------------------------+
|        Mutable useRef Updates         |
+---------------------------------------+
                    |
                    v
+---------------------------------------+
|   React Overlay rAF Dom Positioning   |
+---------------------------------------+

```

---

## Dev Guide

### Add a Placeable Object

1. Add the SVG to `public/assets/`.
2. Add a `PaletteItem` entry to `src/utils/paletteRegistry.ts` (set `width` / `height` to the SVG viewBox).
3. The convex hull is pre-extracted at module load. The engine builds the body and the overlay renders automatically.

### Add a Track

1. Add a `TrackDefinition` to `src/utils/tracks.ts` (dark pixels = line).
2. The `TRACKS` array in the same file controls the control panel dropdown.

### Add an MCU Method

1. Add the method name to `MCU_METHODS` in `src/types/vmc.ts`.
2. Add the signature to `McuApi` in the same file.
3. Implement it in `SimulationEngine.buildMcuApi()`.
4. *(Optional)* Add a Blockly block in `src/utils/blocklyBlocks.ts` and a Python generator entry. Use `callMcu(MCU_METHODS.yourMethod, ...)` to keep bridge consistent.
5. *(Optional)* Add a parser test case in `src/parsers/pythonParser.ts`.

### Add a Blockly Block

1. Add a `BlockSpec` to `BLOCK_SPECS` in `src/utils/blocklyBlocks.ts`.
2. Provide **both** JS and Python generators: `b => "mcu.x(...)"`.
3. For custom fields (dropdowns, variables), extend the `arg` builder helpers.
4. Register the block in the toolbox via `category(...)` and `block(...)` in `getToolbox()`.
5. `text_print` is overridden to route to `mcu.printLog` so output shows in `ConsolePanel`.

---

## Troubleshooting

### Simulation Glitches?

If the simulation stops moving, freezes, **simply refresh your browser tab (`F5` or `Ctrl + R` or `Ctrl + Shift + R`)**.
