# Calc

Calc is a **basic + pro mode** web calculator with a modern UI and a Python backend that evaluates expressions safely.

## Features

- **Basic mode**: keypad + basic operations.
- **Pro mode**: expression input + common math functions (sin/cos/tan, log/ln, sqrt, powers, etc.).
- Local history (in the browser).
- **Settings**: theme (light/dark/system), accent, angle unit (rad/deg).
- Works on Windows/macOS/Linux (UI runs in your browser).

## Run locally

Requirements: Python 3.10+

```bash
python start.py
```

Then open the printed URL (default: `http://127.0.0.1:5173`).

## Notes

- The server-side evaluator only allows a strict subset of expressions (operators, parentheses, constants, and whitelisted functions).
- The frontend accepts `^` for power (converted to `**` server-side).
- `Ans` reuses the last result.
- The `%` button applies a simple percentage (`*0.01`).

