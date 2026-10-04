import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionController, getAccessToken, operatorAccess, loginDestination} from '../src/services/session.ts';
import type {SessionDriver, AuthState, TrustedUser} from '../src/services/session.ts';
import {createApiClient, ApiError} from '../src/services/api.ts';
const citizen: TrustedUser = {user_id: 'citizen-id', role: 'CITIZEN'};
const operator: TrustedUser = {user_id: 'operator-id', role: 'OPERATOR'};
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(changes: Partial<SessionDriver> = {}) {
  let callback: (token: string | null) => void = () => {};
  const controller = createSessionController({restore: async () => null,
    subscribe: fn => {callback = fn; return () => {callback = () => {};};},
    signIn: async () => 'access-token-test', signOut: async () => {}, loadUser: async () => citizen, ...changes});
  return {controller, emit: (token: string | null) => callback(token)};
}
test('protected operator route waits, redirects missing session and denies citizen', () => {
  const state: AuthState = {loading: true, user: null, error: ''};
  assert.equal(operatorAccess(state), 'loading');
  assert.equal(operatorAccess({...state, loading: false}), 'login');
  assert.equal(operatorAccess({...state, loading: false, user: citizen}), 'denied');
  assert.equal(operatorAccess({...state, loading: false, user: operator}), 'allowed');
  assert.equal(operatorAccess({...state, loading: false, user: {...operator, role: 'ADMIN'}}), 'allowed');
});
test('session restoration verifies role through backend; logout clears access', async () => {
  const {controller} = setup({restore: async () => 'restored-token', loadUser: async () => operator});
  const stop = controller.start(); await flush();
  assert.equal(controller.getSnapshot().user?.role, 'OPERATOR');
  assert.equal(getAccessToken(), 'restored-token');
  await controller.logout(); assert.equal(getAccessToken(), null);
  assert.equal(operatorAccess(controller.getSnapshot()), 'login'); stop();
});
test('failed verification never grants operator access', async () => {
  const {controller} = setup({restore: async () => 'invalid-token', loadUser: async () => {throw new Error('private internal auth failure');}});
  const stop = controller.start(); await flush();
  assert.equal(controller.getSnapshot().user, null); assert.equal(getAccessToken(), null);
  assert.ok(!controller.getSnapshot().error.includes('private')); stop();
});
test('late verification cannot restore a signed-out session', async () => {
  let resolve!: (user: TrustedUser) => void;
  const {controller, emit} = setup({loadUser: () => new Promise<TrustedUser>(done => {resolve = done;})});
  const stop = controller.start(); await flush();
  emit('old-token'); await flush(); emit(null); await flush(); resolve(operator); await flush();
  assert.equal(controller.getSnapshot().user, null); assert.equal(getAccessToken(), null); stop();
});
test('sign-in uses trusted profile role and refreshed token is verified again', async () => {
  const {controller, emit} = setup(); const stop = controller.start(); await flush();
  assert.equal((await controller.login('citizen@example.test', 'not-a-real-password')).role, 'CITIZEN');
  emit('refreshed-token'); await flush(); assert.equal(getAccessToken(), 'refreshed-token');
  await controller.logout(); stop();
});
test('API sends bearer token to FastAPI; auth errors are distinguishable', async () => {
  let received: RequestInit | undefined;
  const client = createApiClient('http://backend', async (_url, init) => {received = init; return Response.json(operator);}, () => 'test-token');
  assert.equal((await client.getCurrentUser()).role, 'OPERATOR');
  assert.equal((received?.headers as Record<string,string>).Authorization, 'Bearer test-token');
  for (const status of [401,403]) await assert.rejects(createApiClient('http://backend', async () => Response.json({}, {status})).getCurrentUser(), error => error instanceof ApiError && error.status === status);
});
test('login return paths stay inside allowed routes', () => {
  assert.equal(loginDestination('CITIZEN', '/operator/dashboard'), '/');
  assert.equal(loginDestination('OPERATOR', undefined), '/operator/dashboard');
  assert.equal(loginDestination('CITIZEN', '/track/CV-real'), '/track/CV-real');
  assert.equal(loginDestination('OPERATOR', '//untrusted.invalid'), '/operator/dashboard');
});
