from __future__ import annotations

import ast
import math
from dataclasses import dataclass
from typing import Any, Callable


class EvalError(Exception):
    pass


AngleUnit = str  # "rad" | "deg"


def _as_float(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    raise EvalError("Invalid value.")


def _check_int(value: Any) -> int:
    if isinstance(value, bool):
        raise EvalError("Expected an integer.")
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    raise EvalError("Expected an integer.")


def _safe_factorial(value: Any) -> int:
    n = _check_int(value)
    if n < 0:
        raise EvalError("factorial() does not accept negative numbers.")
    if n > 5000:
        raise EvalError("factorial() is limited to 5000 to avoid heavy computations.")
    return math.factorial(n)


def _safe_pow(base: Any, exp: Any) -> float:
    b = _as_float(base)
    e = _as_float(exp)
    if abs(e) > 1000:
        raise EvalError("Exponent too large (|exp| > 1000).")
    result = b**e
    if isinstance(result, complex) or (isinstance(result, float) and not math.isfinite(result)):
        raise EvalError("Non-finite result.")
    return float(result)


def _make_trig(angle_unit: AngleUnit) -> dict[str, Callable[..., float]]:
    unit = (angle_unit or "rad").lower()
    if unit not in ("rad", "deg"):
        unit = "rad"

    def _in(x: Any) -> float:
        v = _as_float(x)
        return math.radians(v) if unit == "deg" else v

    def _out(x: float) -> float:
        return math.degrees(x) if unit == "deg" else x

    return {
        "sin": lambda x: math.sin(_in(x)),
        "cos": lambda x: math.cos(_in(x)),
        "tan": lambda x: math.tan(_in(x)),
        "asin": lambda x: _out(math.asin(_as_float(x))),
        "acos": lambda x: _out(math.acos(_as_float(x))),
        "atan": lambda x: _out(math.atan(_as_float(x))),
    }


@dataclass(frozen=True)
class EvalConfig:
    angle_unit: AngleUnit = "rad"


class _SafeEvaluator(ast.NodeVisitor):
    def __init__(self, config: EvalConfig):
        self._config = config
        self._node_budget = 600

        trig = _make_trig(config.angle_unit)
        self._funcs: dict[str, Callable[..., Any]] = {
            **trig,
            "sqrt": lambda x: math.sqrt(_as_float(x)),
            "abs": lambda x: abs(_as_float(x)),
            "floor": lambda x: math.floor(_as_float(x)),
            "ceil": lambda x: math.ceil(_as_float(x)),
            "round": lambda x, ndigits=0: round(_as_float(x), _check_int(ndigits)),
            "log": lambda x, base=10: math.log(_as_float(x), _as_float(base)),
            "ln": lambda x: math.log(_as_float(x)),
            "exp": lambda x: math.exp(_as_float(x)),
            "pow": lambda a, b: _safe_pow(a, b),
            "factorial": _safe_factorial,
            "fact": _safe_factorial,
        }

        self._names: dict[str, Any] = {
            "pi": math.pi,
            "e": math.e,
            "tau": math.tau,
        }

    def _consume_budget(self) -> None:
        self._node_budget -= 1
        if self._node_budget <= 0:
            raise EvalError("Expression is too complex.")

    def visit(self, node: ast.AST) -> Any:  # type: ignore[override]
        self._consume_budget()
        return super().visit(node)

    def generic_visit(self, node: ast.AST) -> Any:
        raise EvalError(f"Disallowed expression ({node.__class__.__name__}).")

    def visit_Expression(self, node: ast.Expression) -> Any:
        return self.visit(node.body)

    def visit_Constant(self, node: ast.Constant) -> Any:
        if isinstance(node.value, (int, float)):
            return node.value
        raise EvalError("Invalid constant.")

    def visit_Name(self, node: ast.Name) -> Any:
        if node.id in self._names:
            return self._names[node.id]
        raise EvalError(f"Unknown name: {node.id}")

    def visit_UnaryOp(self, node: ast.UnaryOp) -> Any:
        value = self.visit(node.operand)
        if isinstance(node.op, ast.UAdd):
            return +_as_float(value)
        if isinstance(node.op, ast.USub):
            return -_as_float(value)
        raise EvalError("Disallowed unary operator.")

    def visit_BinOp(self, node: ast.BinOp) -> Any:
        left = self.visit(node.left)
        right = self.visit(node.right)

        if isinstance(node.op, ast.Add):
            return _as_float(left) + _as_float(right)
        if isinstance(node.op, ast.Sub):
            return _as_float(left) - _as_float(right)
        if isinstance(node.op, ast.Mult):
            return _as_float(left) * _as_float(right)
        if isinstance(node.op, ast.Div):
            r = _as_float(right)
            if r == 0:
                raise EvalError("Division by zero.")
            return _as_float(left) / r
        if isinstance(node.op, ast.Mod):
            r = _as_float(right)
            if r == 0:
                raise EvalError("Modulo by zero.")
            return _as_float(left) % r
        if isinstance(node.op, ast.Pow):
            return _safe_pow(left, right)

        raise EvalError("Disallowed binary operator.")

    def visit_Call(self, node: ast.Call) -> Any:
        if not isinstance(node.func, ast.Name):
            raise EvalError("Disallowed function call.")

        name = node.func.id
        fn = self._funcs.get(name)
        if fn is None:
            raise EvalError(f"Unknown function: {name}")

        if node.keywords:
            raise EvalError("Named arguments are not allowed.")

        args = [self.visit(a) for a in node.args]
        try:
            result = fn(*args)
        except EvalError:
            raise
        except Exception:
            raise EvalError("Computation error.")

        if isinstance(result, complex):
            raise EvalError("Complex results are not supported.")
        if isinstance(result, float) and not math.isfinite(result):
            raise EvalError("Non-finite result.")
        return result


def normalize_expression(expr: str) -> str:
    s = (expr or "").strip()
    s = s.replace("×", "*").replace("÷", "/")
    s = s.replace("^", "**")
    return s


def evaluate(expr: str, *, config: EvalConfig | None = None) -> Any:
    if expr is None:
        raise EvalError("Empty expression.")

    normalized = normalize_expression(expr)
    if not normalized:
        raise EvalError("Empty expression.")
    if len(normalized) > 400:
        raise EvalError("Expression is too long.")

    cfg = config or EvalConfig()
    try:
        tree = ast.parse(normalized, mode="eval")
    except SyntaxError:
        raise EvalError("Invalid syntax.")

    evaluator = _SafeEvaluator(cfg)
    result = evaluator.visit(tree)

    if isinstance(result, float) and result.is_integer():
        return int(result)
    return result


def format_result(value: Any) -> str:
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return format(value, ".15g")
    return str(value)
