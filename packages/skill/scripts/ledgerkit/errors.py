"""只放两样东西：业务错误 `Fail`，以及退出码数字。

任何层都可以 import 它；它自己谁也不 import。
"""


class Fail(Exception):
    """业务错误：抛出即中止，由外壳接住转成「错误：…」并返回对应退出码。"""


OK = 0
BUSINESS = 1      # 业务错：任务不存在、不是你的、参数不合法
USAGE = 2         # 用法错：argparse 自己会退出，这里留给外壳显式用
UNEXPECTED = 3    # 未预期异常
INTERRUPTED = 130  # Ctrl-C / SIGINT
