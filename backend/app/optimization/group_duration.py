"""
Group Duration Engine (spec section 7): when a manager adds multiple
maintenance tasks to the SAME track, the tasks are preserved individually,
but the combined maintenance block only needs to be as long as the
longest chain of tasks that actually must run one after another.

Rules encoded here:
  - Two tasks with no dependency and no shared exclusive resource are
    treated as safely parallel-compatible -> the block only needs to be
    as long as the LONGER of the two (not the sum).
  - An explicit TaskDependency (B depends on A) forces A to finish before
    B starts -> durations add along that chain.
  - Two tasks that both flag `exclusive_resource=True` with the same
    `resource_name` cannot physically run at the same time even without
    an explicit dependency being recorded, so they are treated as an
    implied sequential pair (ordered by creation order) — this is a
    simplifying assumption for the prototype; a real deployment would
    let the manager confirm the intended order.

This reduces to a standard critical-path (longest-path) calculation over
a small DAG, which handles both the "fully parallel" and "fully
sequential" examples in the spec, and everything in between.
"""
from dataclasses import dataclass
from typing import List, Dict, Tuple


@dataclass
class GroupTask:
    id: str
    duration_minutes: int
    resource_name: str = ""
    exclusive_resource: bool = False


def compute_group_duration(tasks: List[GroupTask],
                            dependencies: List[Tuple[str, str]]) -> Dict:
    """dependencies: list of (task_id, depends_on_task_id) pairs.
    Returns {"total_minutes": int, "mode": "PARALLEL"|"SEQUENTIAL"|"MIXED",
             "finish_times": {task_id: minutes_from_block_start}}."""
    if not tasks:
        return {"total_minutes": 0, "mode": "PARALLEL", "finish_times": {}}

    by_id = {t.id: t for t in tasks}
    edges: Dict[str, List[str]] = {t.id: [] for t in tasks}  # task -> [prerequisite task ids]

    for task_id, depends_on in dependencies:
        if task_id in edges and depends_on in by_id:
            edges[task_id].append(depends_on)

    # implied sequential ordering for tasks sharing an exclusive resource
    # with no explicit dependency already linking them
    exclusive_groups: Dict[str, List[str]] = {}
    for t in tasks:
        if t.exclusive_resource and t.resource_name:
            exclusive_groups.setdefault(t.resource_name, []).append(t.id)
    for resource_name, ids in exclusive_groups.items():
        for i in range(1, len(ids)):
            prev_id, cur_id = ids[i - 1], ids[i]
            if prev_id not in edges[cur_id]:
                edges[cur_id].append(prev_id)

    # longest-path (critical path) via memoized DFS
    finish_times: Dict[str, int] = {}

    def finish(task_id: str, visiting=None) -> int:
        if task_id in finish_times:
            return finish_times[task_id]
        visiting = visiting or set()
        if task_id in visiting:
            return by_id[task_id].duration_minutes  # cycle guard — treat as no prerequisite
        visiting = visiting | {task_id}
        prereq_finish = 0
        for dep_id in edges.get(task_id, []):
            prereq_finish = max(prereq_finish, finish(dep_id, visiting))
        f = prereq_finish + by_id[task_id].duration_minutes
        finish_times[task_id] = f
        return f

    for t in tasks:
        finish(t.id)

    total = max(finish_times.values()) if finish_times else 0
    has_edges = any(len(v) > 0 for v in edges.values())
    naive_sum = sum(t.duration_minutes for t in tasks)
    if not has_edges:
        mode = "PARALLEL"
    elif total >= naive_sum:
        mode = "SEQUENTIAL"
    else:
        mode = "MIXED"

    return {"total_minutes": total, "mode": mode, "finish_times": finish_times}
