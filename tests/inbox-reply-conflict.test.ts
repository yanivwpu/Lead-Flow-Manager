import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { InboxReplyConflict } from '../client/src/components/InboxReplyConflict';

test('missing baseline is not described as a newer reply; actual conflicts identify latest activity in en/es/he', async()=>{
  for (const language of ['en','es','he']) {
    const resources=JSON.parse(readFileSync(`client/src/locales/${language}.json`,'utf8'));
    const i18n=createInstance();await i18n.init({lng:language,resources:{[language]:{translation:resources}},interpolation:{escapeValue:false}});
    const render=(code:string)=>renderToStaticMarkup(React.createElement(I18nextProvider,{i18n},React.createElement(InboxReplyConflict,{code,onReview:()=>{},latestReply:{id:'historical',createdAt:'2026-11-18T07:07:39Z',generatedBy:'ai_brain'}})));
    assert.ok(render('reply_state_unavailable').includes(resources.inboxCollaboration.stateUnavailable));
    assert.ok(!render('reply_state_unavailable').includes(resources.inboxCollaboration.conflict));
    assert.ok(render('reply_conflict').includes(resources.inboxCollaboration.conflict));
    assert.ok(render('reply_conflict').includes(resources.inboxCollaboration.aiReply));
    assert.ok(render('reply_conflict').includes('inbox-conflict-latest-reply'));
  }
});
