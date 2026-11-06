ACTIVE_TASKS = {}

def register_task(task_name, instance_id):
    ACTIVE_TASKS[instance_id] = task_name

def release_task(instance_id):
    ACTIVE_TASKS.pop(instance_id, None)

def should_run_task(task_name, max_parallel=5):
    current = sum(1 for t in ACTIVE_TASKS.values() if t == task_name)
    return current < max_parallel
