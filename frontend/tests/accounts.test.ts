import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountActions} from '../src/services/accounts.ts';

test('citizen signup sends no role metadata and uses same-origin confirmation', async () => {
  let input: unknown;
  const actions=createAccountActions({signUp: async args => {input=args; return {error:null};}, resetPasswordForEmail:async()=>({error:null}),updateUser:async()=>({error:null})},'https://frontend.example');
  await actions.signup(' citizen@example.test ', 'long-test-password');
  assert.deepEqual(input,{email:'citizen@example.test',password:'long-test-password',options:{emailRedirectTo:'https://frontend.example/auth/callback'}});
});
test('reset uses approved callback and a non-enumerating message', async () => {
  let destination='';
  const actions=createAccountActions({signUp:async()=>({error:null}),resetPasswordForEmail:async(_email, options)=>{destination=options.redirectTo;return {error:null};},updateUser:async()=>({error:null})},'http://localhost:5173');
  assert.match(await actions.requestReset('citizen@example.test'),/If this address/);
  assert.equal(destination,'http://localhost:5173/auth/reset');
});
test('password updates reject weak passwords and hide provider errors',async()=>{
  const actions=createAccountActions({signUp:async()=>({error:'private'}),resetPasswordForEmail:async()=>({error:'private'}),updateUser:async()=>({error:'private'})},'https://frontend.example');
  await assert.rejects(actions.signup('a@example.test','short'),/at least 12/);
  await assert.rejects(actions.updatePassword('long-test-password'),error=>error instanceof Error && !error.message.includes('private'));
  await assert.rejects(actions.requestReset('a@example.test'),/unavailable/);
});
