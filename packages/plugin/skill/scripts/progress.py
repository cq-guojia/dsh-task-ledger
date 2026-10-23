#!/usr/bin/env python3
"""程序入口：只做四件事，业务逻辑一行都不在这里。

1. 关掉字节码（本脚本会被 cp -r 拷进插件产物，不能带 __pycache__）；
2. 把自己所在目录塞进 sys.path（宿主与 SKILL.md 都按这个路径调，不许改名挪位）；
3. 调 ledgerkit.shell.cli.main；
4. 把返回码交给系统。
"""
import os
import sys

sys.dont_write_bytecode = True

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from ledgerkit.shell.cli import main  # noqa: E402  —— 必须在 sys.path 之后

if __name__ == "__main__":
    sys.exit(main())
