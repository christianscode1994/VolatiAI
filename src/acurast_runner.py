import subprocess
from .main import main

def run_acurast_job():
    # Run engine to update free/pro outputs
    main()
    # Commit + push updated outputs so GitHub Pages serves fresh data
    subprocess.run(["git", "add", "."], check=True)
    subprocess.run(["git", "commit", "-m", "Acurast update"], check=True)
    subprocess.run(["git", "push"], check=True)

if __name__ == "__main__":
    run_acurast_job()
