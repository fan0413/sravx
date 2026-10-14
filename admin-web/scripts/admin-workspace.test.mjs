import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminChannel, channelSwitchPath, isWorkspacePath, workspaceForPath, isWorkspaceEditorPath, workspaceMenuGroups } from '../src/lib/admin-workspace.ts';
test('channel values and workspace routes are restricted', () => {
  assert.equal(parseAdminChannel('web'), 'web');
  assert.equal(parseAdminChannel('common'), 'common');
  assert.equal(parseAdminChannel('miniprogram'), 'miniprogram');
  assert.equal(parseAdminChannel('unknown'), null);
  assert.equal(isWorkspacePath('/channel/web/extra'), false);
});
test('workspace switches navigate consistently; editors are identified for confirmation', () => {
  for (const path of ['/product/edit/1', '/product/list', '/order/list', '/banner/list']) assert.equal(channelSwitchPath(path, 'miniprogram'), '/channel/miniprogram');
  assert.equal(channelSwitchPath('/channel/web', 'miniprogram'), '/channel/miniprogram');
  assert.equal(channelSwitchPath('/channel/common', 'common'), null);
  for (const path of ['/product/create', '/product/edit/1', '/product/variants/1', '/points-product/edit/1', '/user/detail/1']) assert.equal(isWorkspaceEditorPath(path), true);
  for (const path of ['/product/list', '/points-order/list', '/channel/common']) assert.equal(isWorkspaceEditorPath(path), false);
});
test('direct links, refresh and history classify business routes by their actual owner', () => {
  for (const path of ['/dashboard', '/product/list', '/product/edit/1', '/category/list', '/banner/list', '/order/detail/1', '/user/detail/1', '/refund/detail/1', '/scissors/after-sale']) assert.equal(workspaceForPath(path), 'common');
  for (const path of ['/points-product/list', '/points-product/edit/1', '/points-order/detail/1', '/scissors/list']) assert.equal(workspaceForPath(path), 'miniprogram');
  assert.equal(workspaceForPath('/channel/web'), 'web');
  assert.equal(workspaceForPath('/channel/common'), 'common');
});
test('common and exclusive registries are disjoint and match sidebar route ownership', () => {
  const features = { targetMode: true, catalogMode: true, operationsMode: true };
  const paths = channel => workspaceMenuGroups(channel, features).flatMap(group => group.items.map(item => item.path));
  const common = paths('common'), mini = paths('miniprogram');
  assert.ok(common.includes('/product/list')); assert.ok(common.includes('/scissors/after-sale'));
  assert.ok(mini.includes('/points-order/list')); assert.ok(mini.includes('/scissors/list'));
  assert.deepEqual(paths('web'), []);
  assert.equal(new Set([...common, ...mini]).size, common.length + mini.length);
  for (const path of common) assert.equal(workspaceForPath(path), 'common');
  for (const path of mini) assert.equal(workspaceForPath(path), 'miniprogram');
});
test('registry respects existing catalog and operations feature gates', () => {
  for (const channel of ['common', 'web', 'miniprogram']) assert.deepEqual(workspaceMenuGroups(channel, { targetMode: true, catalogMode: false, operationsMode: false }), []);
  const catalog = workspaceMenuGroups('common', { targetMode: true, catalogMode: true, operationsMode: false }).flatMap(g => g.items.map(i => i.path));
  assert.ok(catalog.includes('/product/list')); assert.ok(!catalog.includes('/order/list')); assert.ok(!catalog.includes('/user/list'));
  assert.ok(!catalog.includes('/coupon/list')); assert.ok(!catalog.includes('/gift-card/list'));
  const operations = workspaceMenuGroups('miniprogram', { targetMode: true, catalogMode: false, operationsMode: true }).flatMap(g => g.items.map(i => i.path));
  assert.deepEqual(operations, ['/points-order/list']);
});
