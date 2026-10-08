#!/usr/bin/env python3
"""Bounded, local continuation for this implementation; never shipped with the game."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time

PROMPT = (
    "Continue the authorized Ashworth Station implementation. Read "
    "plans/ashworth-implementation.md and inspect Git status before editing. "
    "Resume the next unfinished task; test and commit coherent changes. "
    "Do not discard unfinished changes or claim real-device checks passed. "
    "Update the ledger. If all implementation and automated checks are complete, "
    "finish publication and set 'Run status: complete'. If blocked by a product "
    "decision or permanent error, record 'Run status: blocked' and the reason."
)
PERMANENT = re.compile(r"invalid.?api.?key|authentication failed|insufficient_quota|billing|monthly usage limit", re.I)
TEMPORARY = re.compile(r"rate.?limit|usage.?limit|quota|429|overloaded|try again|retry|temporarily|connection|timeout", re.I)


def run_status(root):
    text = (root / 'plans/ashworth-implementation.md').read_text()
    match = re.search(r'^Run status: (\w+)', text, re.M)
    return match.group(1) if match else 'blocked'


def last_error(session):
    if not session or not session.exists():
        return ''
    last = {}
    for line in session.read_text().split('\n'):
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        message = entry.get('message', {})
        if message.get('role') == 'assistant':
            last = message
    return last.get('errorMessage', '') if last.get('stopReason') == 'error' else ''


def session_pending(session):
    """An idle status is insufficient while a prompt/tool result still awaits its turn."""
    if not session or not session.exists():
        return True  # fail closed when the interactive writer's state cannot be checked
    latest = {}
    for line in session.read_text().split('\n'):
        try:
            message = json.loads(line).get('message', {})
        except ValueError:
            continue
        if message.get('role') in ('user', 'assistant', 'toolResult'):
            latest = message
    return latest.get('role') != 'assistant' or latest.get('stopReason') in ('pending', 'toolUse')


def coordinator(root):
    result = subprocess.run(['herdr', 'pane', 'list'], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Cannot establish Herdr coordinator state; refusing a second writer')
    panes = json.loads(result.stdout)['result']['panes']
    return [p for p in panes if p.get('agent') == 'pi' and
            Path(p.get('foreground_cwd', p.get('cwd', '/'))).resolve() == root]


def cli_batch(root, state_dir, args, deadline):
    """Only used after no interactive Pi writer remains. JSON failures need inspection."""
    log = state_dir / f'batch-{int(time.time())}.jsonl'
    command = ['pi', '--session-id', 'ashworth-autonomous', '--provider', args.provider,
               '--model', args.model, '--thinking', 'high', '--mode', 'json', PROMPT]
    with log.open('w') as output, (state_dir / 'stderr.log').open('a') as errors:
        process = subprocess.Popen(command, cwd=root, stdout=output, stderr=errors,
                                   start_new_session=True)
        try:
            process.wait(timeout=min(7200, max(1, deadline - time.time())))
        except subprocess.TimeoutExpired:
            import signal
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
            raise RuntimeError('CLI batch exceeded its time budget; unfinished work preserved')
    return cli_result(log.read_text(), process.returncode)


def cli_result(text, returncode):
    error = ''
    settled = False
    for line in text.split('\n'):
        if not line:
            continue
        event = json.loads(line)
        if event.get('type') == 'message_end' and event.get('message', {}).get('role') == 'assistant':
            message = event['message']
            error = message.get('errorMessage', '') if message.get('stopReason') in ('error', 'aborted') else ''
        if event.get('type') == 'agent_settled':
            settled = not event.get('aborted', False)
    if returncode or not settled:
        return error or 'CLI failed or aborted; inspect local logs before retrying'
    return error


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    parser.add_argument('--session-file', type=Path)
    parser.add_argument('--provider', default='openai')
    parser.add_argument('--model', default='gpt-6.1-sol')
    parser.add_argument('--hours', type=float, default=12)
    parser.add_argument('--max-attempts', type=int, default=24)
    parser.add_argument('--interval', type=float, default=900)
    args = parser.parse_args()
    if args.hours <= 0 or args.max_attempts < 1 or args.interval < 300:
        parser.error('Require positive bounds and an interval of at least 300 seconds')
    root = args.root.resolve()
    git_dir = subprocess.check_output(['git', 'rev-parse', '--absolute-git-dir'], cwd=root, text=True).strip()
    state_dir = Path(git_dir) / 'ashworth-run'
    state_dir.mkdir(exist_ok=True)
    lock = (state_dir / 'supervisor.lock').open('w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        parser.error('A supervisor already owns this checkout')
    started = time.time()
    deadline = started + args.hours * 3600
    attempts = 0
    identical = 0
    previous = ''

    def record(status, detail=''):
        (state_dir / 'status.json').write_text(json.dumps({
            'status': status, 'detail': detail, 'pid': os.getpid(),
            'attempts': attempts, 'started': started, 'deadline': deadline,
            'updated': time.time()
        }, indent=2) + '\n')
        print(status, detail, flush=True)

    record('watching')
    while time.time() < deadline and attempts < args.max_attempts:
        if (state_dir / 'STOP').exists():
            record('stopped', 'STOP file present')
            return
        status = run_status(root)
        if status in ('complete', 'blocked'):
            record(status, 'Implementation ledger ended the run')
            return
        try:
            panes = coordinator(root)
            if any(p.get('agent_status') not in ('idle', 'done') for p in panes):
                time.sleep(min(args.interval, max(0, deadline - time.time())))
                continue
            if panes and session_pending(args.session_file):
                time.sleep(min(args.interval, max(0, deadline - time.time())))
                continue
            error = last_error(args.session_file) if panes else ''
            if PERMANENT.search(error):
                record('blocked', 'Permanent provider error; inspect coordinator session')
                return
            identical = identical + 1 if error and error == previous else 0
            previous = error
            if identical >= 3 and not TEMPORARY.search(error):
                record('blocked', 'Repeated identical provider failure; inspect session')
                return
            attempts += 1
            if panes:
                # Recheck immediately before input; the live Pi process remains the only writer.
                fresh = coordinator(root)
                if len(fresh) != 1:
                    raise RuntimeError('Ambiguous coordinator; refusing pane input')
                if fresh[0].get('agent_status') not in ('idle', 'done') or session_pending(args.session_file):
                    attempts -= 1
                    continue
                subprocess.run(['herdr', 'pane', 'run', fresh[0]['pane_id'], PROMPT], check=True)
                record('continued', 'Prompt sent to idle coordinator')
            else:
                record('running', 'No interactive coordinator; persistent CLI batch started')
                error = cli_batch(root, state_dir, args, deadline)
                if error and (PERMANENT.search(error) or not TEMPORARY.search(error)):
                    record('blocked', 'Non-transient CLI failure; inspect local logs')
                    return
                record('waiting' if error else 'watching', 'Batch ended; ledger will be checked again')
        except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
            record('blocked', str(exc))
            return
        time.sleep(min(args.interval, max(0, deadline - time.time())))
    record('stopped', 'Deadline or continuation-attempt bound reached')


if __name__ == '__main__':
    main()
