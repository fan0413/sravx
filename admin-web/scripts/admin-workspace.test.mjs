import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminChannel, channelSwitchPath, isWorkspacePath } from '../src/lib/admin-workspace.ts';
test('channel values and workspace routes are restricted', () => {
  assert.equal(parseAdminChannel('web'), 'web');
  assert.equal(parseAdminChannel('miniprogram'), 'miniprogram');
  assert.equal(parseAdminChannel('unknown'), null);
  assert.equal(isWorkspacePath('/channel/web/extra'), false);
});
test('switching shared pages never remounts an unsaved editor', () => {
  for (const path of ['/product/edit/1', '/product/list', '/order/list', '/banner/list']) assert.equal(channelSwitchPath(path, 'miniprogram'), null);
  assert.equal(channelSwitchPath('/channel/web', 'miniprogram'), '/channel/miniprogram');
});
