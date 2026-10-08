"""Supervisor checks use fake events, never a model call or real pane input."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('supervisor', Path(__file__).parents[1] / 'tools/supervise.py')
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)


def events(*entries):
    return '\n'.join(json.dumps(e, ensure_ascii=False) for e in entries) + '\n'


def ended(reason='stop', error=''):
    return {'type': 'message_end', 'message': {'role': 'assistant', 'stopReason': reason, 'errorMessage': error}}


class SupervisorTests(unittest.TestCase):
    def test_zero_exit_provider_failure_is_failure(self):
        log = events(ended('error', 'usage limit; try again'), {'type': 'agent_settled', 'aborted': False})
        self.assertEqual(supervisor.cli_result(log, 0), 'usage limit; try again')

    def test_settled_clean_result(self):
        self.assertEqual(supervisor.cli_result(events(ended(), {'type': 'agent_settled', 'aborted': False}), 0), '')

    def test_unsettled_or_aborted_is_failure(self):
        self.assertTrue(supervisor.cli_result(events(ended()), 0))
        self.assertTrue(supervisor.cli_result(events(ended(), {'type': 'agent_settled', 'aborted': True}), 0))
        self.assertTrue(supervisor.cli_result(events(ended(), {'type': 'agent_settled', 'aborted': False}), 1))

    def test_successful_retry_clears_earlier_error(self):
        log = events(ended('error', '429'), ended(), {'type': 'agent_settled', 'aborted': False})
        self.assertEqual(supervisor.cli_result(log, 0), '')

    def test_unicode_line_separator_is_not_record_boundary(self):
        log = events(ended('error', '429\u2028retry'), {'type': 'agent_settled', 'aborted': False})
        self.assertEqual(supervisor.cli_result(log, 0), '429\u2028retry')

    def test_usage_window_is_temporary_not_permanent(self):
        error = 'Quota exceeded. Usage limit; try again in five hours.'
        self.assertTrue(supervisor.TEMPORARY.search(error))
        self.assertFalse(supervisor.PERMANENT.search(error))
        self.assertTrue(supervisor.PERMANENT.search('insufficient_quota: check billing'))

    def test_queued_prompt_or_tool_work_never_receives_duplicate_continuation(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Path(directory) / 'session.jsonl'
            self.assertTrue(supervisor.session_pending(session))
            session.write_text(events({'message': {'role': 'user', 'content': supervisor.PROMPT}}))
            self.assertTrue(supervisor.session_pending(session))
            session.write_text(events({'message': ended('toolUse')['message']}))
            self.assertTrue(supervisor.session_pending(session))
            session.write_text(events({'message': {'role': 'toolResult'}}))
            self.assertTrue(supervisor.session_pending(session))
            session.write_text(events({'message': ended('error', 'usage limit')['message']}))
            self.assertFalse(supervisor.session_pending(session))
            session.write_text(events({'message': ended()['message']}))
            self.assertFalse(supervisor.session_pending(session))

    def test_ledger_and_latest_assistant(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'plans').mkdir()
            (root / 'plans/ashworth-implementation.md').write_text('Run status: complete\n')
            self.assertEqual(supervisor.run_status(root), 'complete')
            session = root / 'session.jsonl'
            session.write_text(events({'message': ended('error', '429')['message']}, {'message': {'role': 'user'}}))
            self.assertEqual(supervisor.last_error(session), '429')
            session.write_text(session.read_text() + events({'message': ended()['message']}))
            self.assertEqual(supervisor.last_error(session), '')


if __name__ == '__main__':
    unittest.main()
