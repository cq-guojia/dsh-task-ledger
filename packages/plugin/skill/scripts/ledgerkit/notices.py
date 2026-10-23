"""进程级提示收集器：只收文本，永不打印。

各层都能往里放（数据层读盘时的版本告警、env 的兜底身份、业务层的兜底提示），
最后由 shell/render.py 一次性打到 stderr。同一句只收一次。
"""

_seen: set[str] = set()
_items: list[str] = []


def note(text: str) -> None:
    """收一条提示；重复的同一句自动忽略。"""
    line = (text or "").strip()
    if not line or line in _seen:
        return
    _seen.add(line)
    _items.append(line)


def warnings() -> tuple[str, ...]:
    """取当前全部提示（只有 render.py 与 runner.py 能调）。"""
    return tuple(_items)


def clear() -> None:
    """清空（只有 render.py 与 runner.py 能调）。"""
    _seen.clear()
    _items.clear()
