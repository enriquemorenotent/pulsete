import assert from 'node:assert/strict';
import test from 'node:test';
import type { MessageArrival } from '../shared/protocol-messages.js';
import { isMessageArrivalNotificationAllowed as allowed, type ContactNotificationSettings } from '../web/src/contact-notifications/settings.js';

const arrival: MessageArrival = {
  buffer: { id:'buffer', networkId:'net', kind:'query', target:'Alice', unread:0, priorityUnread:0, lastReadTs:null, lastReadMessageId:null },
  message: { id:'exact-message', bufferId:'buffer', networkId:'net', target:'Alice', nick:'Alice', body:'hello', kind:'line', self:false, ts:1 },
};
const settings: ContactNotificationSettings = {enabled:true,systemEnabled:false,sound:'chirp',contacts:[{networkId:'net',nick:'Alice'}],channels:[]};
const input = {arrival,settings,appVisibleAndFocused:true,selectedBufferId:'other'};

test('live arrival eligibility does not depend on unread count or loaded history', () => {
  assert.equal(allowed(input),true);
  assert.equal(allowed({...input,arrival:{...arrival,buffer:{...arrival.buffer,unread:99}}}),true);
});

test('selected conversations are quiet only while the application is visible and focused', () => {
  assert.equal(allowed({...input,selectedBufferId:'buffer'}),false);
  assert.equal(allowed({...input,selectedBufferId:'buffer',appVisibleAndFocused:false}),true);
});

test('arrival eligibility respects sound and desktop notification switches independently', () => {
  assert.equal(allowed({...input,settings:{...settings,enabled:false}}),false);
  assert.equal(allowed({...input,settings:{...settings,enabled:false,systemEnabled:true}}),true);
});

test('arrival eligibility matches the exact sender identity after nickname changes', () => {
  const configured = {...settings, contacts:[{networkId:'net',nick:'OldNick',identity:{kind:'account' as const,value:'alice-account'}}]};
  assert.equal(allowed({...input,settings:configured,arrival:{...arrival,message:{...arrival.message,senderIdentity:{kind:'account',value:'alice-account'}}}}),true);
  assert.equal(allowed({...input,settings:configured,arrival:{...arrival,message:{...arrival.message,nick:'OldNick',senderIdentity:{kind:'account',value:'someone-else'}}}}),false);
});

test('channel arrivals require a matching channel and network rule', () => {
  const channel = {...arrival,buffer:{...arrival.buffer,kind:'channel' as const,target:'#chat'},message:{...arrival.message,target:'#chat'}};
  const configured = {...settings,contacts:[],channels:[{networkId:'net',channel:'#chat'}]};
  assert.equal(allowed({...input,arrival:channel,settings:configured}),true);
  assert.equal(allowed({...input,arrival:channel,settings:{...configured,channels:[{networkId:'other',channel:'#chat'}]}}),false);
  assert.equal(allowed({...input,arrival:channel,settings:{...configured,channels:[{networkId:'net',channel:'#other'}]}}),false);
});

test('outgoing, historical, system and mismatched-message arrivals cannot notify', () => {
  for (const message of [
    {...arrival.message,self:true}, {...arrival.message,delivery:'server-history' as const},
    {...arrival.message,kind:'system' as const}, {...arrival.message,bufferId:'other'},
    {...arrival.message,networkId:'other'},
  ]) assert.equal(allowed({...input,arrival:{...arrival,message}}),false);
  assert.equal(allowed({...input,arrival:{...arrival,buffer:{...arrival.buffer,kind:'server'}}}),false);
});
