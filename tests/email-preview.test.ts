import test from 'node:test';
import assert from 'node:assert/strict';
import {emailTextPreview} from '../server/email-preview.ts';
const encoded=(value:string)=>({data:Buffer.from(value).toString('base64url')});

test('HTML-only Gmail draft exposes outgoing text and identifies the quoted thread',()=>{
 const result=emailTextPreview({mimeType:'text/html',body:encoded('<div>Hi&nbsp;team!<br>Invoice attached for 1202–821 Cambie St.</div><div class="gmail_quote">On Monday wrote:<blockquote>Earlier delivery message</blockquote></div>')});
 assert.equal(result.fromHtml,true);assert.equal(result.hasOwnText,true);
 assert.match(result.text,/Hi team!\nInvoice attached for 1202–821 Cambie St\./);
 assert.match(result.text,/Earlier delivery message/);
});
test('multipart alternative prefers the existing plain-text version',()=>{
 const result=emailTextPreview({mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',body:encoded('Plain invoice message')},{mimeType:'text/html',body:encoded('<b>Different HTML message</b>')}]});
 assert.equal(result.text,'Plain invoice message');assert.equal(result.fromHtml,false);assert.equal(result.hasOwnText,true);
});
test('malicious HTML becomes inert text without script, styling, or remote attributes',()=>{
 const result=emailTextPreview({mimeType:'text/html',body:encoded('<style>body{display:none}</style><script>fetch("https://attacker.test")</script><div>Pay &amp; review <img src="https://tracker.test/pixel"><a href="javascript:alert(1)">invoice</a> &lt;script&gt;</div>')});
 assert.equal(result.text,'Pay & review invoice <script>');
 assert.doesNotMatch(result.text,/attacker|tracker|javascript:|display:none/);
});
test('quoted-only HTML does not satisfy the outgoing-message check',()=>{
 const result=emailTextPreview({mimeType:'text/html',body:encoded('<div class="gmail_quote">On Monday wrote:<blockquote>Previous message</blockquote></div>')});
 assert.equal(result.hasOwnText,false);assert.match(result.text,/Previous message/);
});
