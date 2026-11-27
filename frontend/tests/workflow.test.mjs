import assert from 'node:assert/strict'
import test from 'node:test'
import { manualTopic, usableStatus } from '../src/lib/workflow.ts'
import { foldSearch, latestSessionId } from '../src/lib/vehicle.ts'

test('a bad signal suppresses a fault-specific manual query', () => {
  const result = { status: 'anomaly', signal_quality: 'bad', anomaly_type: 'F14' }
  assert.equal(usableStatus(result), 'check_failed')
  assert.equal(manualTopic(result), 'осмотр двигателя техническое обслуживание')
  assert.match(manualTopic({ ...result, signal_quality: 'warning' }), /цепь/)
})

test('vehicle lookup folds Cyrillic and Latin input', () => {
  assert.equal(foldSearch('В 418 НК 98'), foldSearch('B418HK98'))
})

test('choosing the latest check preserves the input history', () => {
  const sessions = [
    { session_id: 'older', checked_at: '2026-01-02T00:00:00Z' },
    { session_id: 'newer', checked_at: '2026-02-01T00:00:00Z' },
  ]
  assert.equal(latestSessionId({ sessions }), 'newer')
  assert.equal(sessions[0].session_id, 'older')
  assert.equal(latestSessionId({ sessions: [] }), '')
})
