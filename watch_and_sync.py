"""
watch_and_sync.py — Auto-sync + Restore Points
Surveille AuditVT_Comparator.html et pousse automatiquement sur GitHub.
Crée un restore point (git tag) toutes les RESTORE_EVERY syncs.
"""

import time
import shutil
import subprocess
import os
from pathlib import Path
from datetime import datetime

# ── Configuration ──────────────────────────────────────────────────────────────
SOURCE        = Path(r"C:\Users\aymer\Desktop\AI\PAI\reports\AuditVT_Comparator.html")
REPO          = Path(r"C:\Users\aymer\Desktop\AI\revue-audit-energetique")
DEST          = REPO / "AuditVT_Comparator.html"
POLL_INTERVAL = 5       # secondes entre chaque vérification
DEBOUNCE      = 3       # secondes d'attente pour stabilisation du fichier
RESTORE_EVERY = 5       # créer un restore point toutes les N syncs
# ──────────────────────────────────────────────────────────────────────────────

sync_count   = 0
last_size    = 0

RESET  = "\033[0m"
GREEN  = "\033[92m"
BLUE   = "\033[94m"
YELLOW = "\033[93m"
RED    = "\033[91m"
BOLD   = "\033[1m"

def log(color, icon, msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"{color}{BOLD}[{ts}] {icon}  {msg}{RESET}")

def git(*args, check=False):
    result = subprocess.run(
        ["git"] + list(args),
        cwd=REPO,
        capture_output=True,
        text=True
    )
    return result

def get_mtime_and_size(path):
    try:
        s = path.stat()
        return s.st_mtime, s.st_size
    except FileNotFoundError:
        return 0, 0

def create_restore_point(label=None):
    """Crée un git tag de restore point."""
    ts        = datetime.now().strftime("%Y-%m-%d_%H-%M")
    tag_name  = f"restore/{ts}"
    tag_msg   = label or f"Restore point automatique — {ts}"
    r = git("tag", "-a", tag_name, "-m", tag_msg)
    if r.returncode == 0:
        git("push", "origin", tag_name)
        log(YELLOW, "📌", f"Restore point créé : {tag_name}")
        # Sauvegarder copie locale horodatée
        restore_dir = REPO / "restore_points"
        restore_dir.mkdir(exist_ok=True)
        shutil.copy2(DEST, restore_dir / f"AuditVT_{ts}.html")
        log(YELLOW, "💾", f"Copie locale : restore_points/AuditVT_{ts}.html")
    else:
        log(RED, "⚠️", f"Restore point échoué : {r.stderr.strip()}")

def sync():
    global sync_count
    now = datetime.now()
    ts  = now.strftime("%Y-%m-%d %H:%M")

    try:
        shutil.copy2(SOURCE, DEST)
    except Exception as e:
        log(RED, "❌", f"Copie échouée : {e}")
        return

    git("add", "AuditVT_Comparator.html")

    commit_msg = f"Auto-sync — {ts}"
    r = git("commit", "-m", commit_msg)
    if "nothing to commit" in r.stdout + r.stderr:
        log(BLUE, "═", "Aucun changement à committer")
        return

    if r.returncode != 0:
        log(RED, "❌", f"Commit échoué : {r.stderr.strip()}")
        return

    sync_count += 1
    log(GREEN, "✅", f"Commit #{sync_count} — {ts}")

    # Push
    r_push = git("push")
    if r_push.returncode == 0:
        log(GREEN, "🚀", "Pushé sur GitHub")
    else:
        log(RED, "⚠️", f"Push échoué (sera retenté) : {r_push.stderr.strip()[:80]}")

    # Restore point automatique toutes les RESTORE_EVERY syncs
    if sync_count % RESTORE_EVERY == 0:
        create_restore_point()

def main():
    global last_size
    print(f"\n{BOLD}{BLUE}{'═'*55}")
    print(f"  AuditVT — Auto-sync & Restore Points")
    print(f"  Source  : {SOURCE}")
    print(f"  Repo    : {REPO}")
    print(f"  Poll    : {POLL_INTERVAL}s  |  Restore : toutes les {RESTORE_EVERY} syncs")
    print(f"{'═'*55}{RESET}\n")

    if not SOURCE.exists():
        log(RED, "❌", f"Fichier source introuvable : {SOURCE}")
        input("Appuie sur Entrée pour quitter.")
        return

    last_mtime, last_size = get_mtime_and_size(SOURCE)
    log(BLUE, "👁️", f"Surveillance démarrée — Ctrl+C pour arrêter")
    log(BLUE, "📂", f"Watching: {SOURCE.name}")
    print()

    pending_change = False
    pending_since  = None

    try:
        while True:
            time.sleep(POLL_INTERVAL)
            cur_mtime, cur_size = get_mtime_and_size(SOURCE)

            if cur_mtime != last_mtime or cur_size != last_size:
                if not pending_change:
                    pending_change = True
                    pending_since  = time.time()
                    log(BLUE, "🔍", "Changement détecté — attente stabilisation...")
                last_mtime = cur_mtime
                last_size  = cur_size
            elif pending_change and (time.time() - pending_since) >= DEBOUNCE:
                pending_change = False
                sync()

    except KeyboardInterrupt:
        print(f"\n{YELLOW}{BOLD}Arrêt demandé.{RESET}")
        # Restore point final à l'arrêt si des syncs ont eu lieu
        if sync_count > 0:
            create_restore_point(f"Restore point — arrêt manuel après {sync_count} sync(s)")
        log(GREEN, "👋", "Watcher arrêté proprement.")

if __name__ == "__main__":
    main()
