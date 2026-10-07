import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const buildRoot = resolve('dist/build/mp-weixin');
const appJsonPath = resolve(buildRoot, 'app.json');
const projectConfigPath = resolve(buildRoot, 'project.config.json');
const navigationSourceRoot = resolve('static/navigation');
const navigationBuildRoot = resolve(buildRoot, 'static/navigation');
const userMenuSourceRoot = resolve('static/user-menu');
const userMenuBuildRoot = resolve(buildRoot, 'static/user-menu');
const navigationAssets = [
  'sravx-mark.png',
  'shopping-bag.png',
  'shopping-bag-active.png',
  'clipboard-list.png',
  'clipboard-list-active.png',
  'user-round.png',
  'user-round-active.png',
];
const userMenuAssets = ['gift.png', 'map-pin.png', 'message-circle.png', 'headphones.png', 'gift-neutral.png', 'map-pin-neutral.png', 'message-circle-neutral.png', 'headphones-neutral.png'];

await access(appJsonPath);
const appConfig = JSON.parse(await readFile(appJsonPath, 'utf8'));

if (!Array.isArray(appConfig.pages) || appConfig.pages.length === 0) {
  throw new Error('小程序构建产物缺少 pages 配置。');
}

if (!Array.isArray(appConfig.subPackages)) {
  throw new Error('小程序构建产物缺少 subPackages 数组。');
}

// 微信开发者工具唯一入口就是构建产物目录。根目录已经是小程序根，
// 因此 miniprogramRoot 必须为空，不能再写入嵌套的构建路径。
await writeFile(projectConfigPath, `${JSON.stringify({
  description: 'SRAVX 微信开发者工具唯一入口：此构建目录。',
  miniprogramRoot: '',
  compileType: 'miniprogram',
  appid: 'wx6beed9723f7e1abf',
  projectname: 'sravx',
  setting: {
    urlCheck: false,
    es6: true,
    postcss: false,
    minified: false,
    newFeature: true,
    bigPackageSizeSupport: true,
  },
  packOptions: { ignore: [] },
}, null, 2)}\n`, 'utf8');

// 当前构建器不会自动拷贝 static 目录。底部导航的本地图标必须在每次构建后
// 显式写入小程序根目录，否则模拟器和真机都会得到空白图标。
await mkdir(navigationBuildRoot, { recursive: true });
await Promise.all(navigationAssets.map(async (fileName) => {
  const source = resolve(navigationSourceRoot, fileName);
  await access(source);
  await copyFile(source, resolve(navigationBuildRoot, fileName));
}));
await mkdir(userMenuBuildRoot, { recursive: true });
await Promise.all(userMenuAssets.map(async (fileName) => {
  const source = resolve(userMenuSourceRoot, fileName);
  await access(source);
  await copyFile(source, resolve(userMenuBuildRoot, fileName));
}));


console.log(`微信小程序构建配置有效：${appConfig.pages.length} 个页面，subPackages=${appConfig.subPackages.length}；请从 dist/build/mp-weixin 导入。`);
