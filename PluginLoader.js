const fs = require("fs");
const Plugin = require("./Plugin.js");
const utils = require("./src/utils");

class PluginLoader extends Plugin {
  constructor() {
    super({
      name: "插件加载器",
      description: "专门用于加载插件的插件",
      version: 0.4
    }, {});
  }

  install() {
    return super.install().then(() => {
      global.PluginLoader = this;
    });
  }

  uninstall() {
    return super.uninstall().then(() => {
      global.PluginLoader = undefined;
      delete global.PluginLoader;
    });
  }

  upgrade(_this) {
    return super.upgrade(_this).then((_this) => {
      global.PluginLoader = this
      this.header = _this.header;
    });
  }

  /**
   * 刷新插件并重载</br>
   * 已启用插件将会比较版本号,当版本号大于已载入插件时重载</br>
   * 未启用插件将会强制重载,不判断版本号
   * @return {PromiseLike<*>}
   */
  refreshPlugin() {
    let header = this.header;
    let promise = Promise.resolve();
    promise = promise.then(() => {
      return fs.readdirSync("./plugin")
    }).then(files => {
      let p = Promise.resolve();
      for (let file of files) {
        let path = `./plugin/${file}`;
        PluginLoader.cleanCache(require.resolve(path));
        let mod = require(path);
        if (Plugin.isPrototypeOf(mod)) {
          /**
           * @type Plugin
           */
          let newer = new mod();
          /**
           * @type Plugin
           */
          let older = header[newer.id];
          if (older && older.installed) {
            if (newer.version > older.version) {
              p = p.then(() => {
                return this.toggle(older, newer)
              })
            } else {
              console.log(`${utils.now()} 无版本变动 ${newer.id}:${newer.version}`)
            }
          } else {
            header[newer.id] = newer;
            console.log(`${utils.now()} 重载插件 ${newer.id}:${newer.version}`)
          }
        } else {
          console.log(`${utils.now()} Plugin.isPrototypeOf(${mod.name}) === false`)
        }
      }
      return p;
    }).catch(err => {
      console.log(`${utils.now()} `, err);
    })

    return promise;
  }

  /**
   *
   * @return {string[]}
   */
  get plugins() {
    return Object.keys(this.header);
  }

  /**
   * 设置插件的安装卸载
   *
   * **注**:当安装失败时会自动卸载
   * @param {boolean}bool 为`true`时安装选定插件,为`false`时卸载选定插件
   * @param {string}pluginKey 选定插件的id
   * @return {Promise<*>}
   */
  handle(bool, ...pluginKey) {
    let header = this.header;
    let promise = Promise.resolve();
    if (bool) {
      for (let key of pluginKey) {
        /**
         * @type Plugin
         */
        let plugin = header[key];
        if (!plugin || plugin.installed || plugin.error) {
          continue;
        }
        promise = promise.then(() => {
          console.log(`${utils.now()} ${key}开始安装`)
          return this.toggle(null, plugin);
        })
      }
    } else {
      for (let key of pluginKey) {
        /**
         * @type Plugin
         */
        let plugin = header[key];
        if (!plugin.installed) {
          console.log(`${utils.now()} ${key}未安装: ${plugin._state}`)
          continue;
        }
        promise = promise.then(() => {
          console.log(`${utils.now()} ${key}开始卸载`)
          return this.toggle(plugin, null);
        })
      }
    }
    return promise;
  }

  /**
   * 清除缓存以便热重载
   * @param {string}modulePath 模块路径
   * @return {any}
   */
  static cleanCache(modulePath) {
    let module = require.cache[modulePath];
    if (module == null) {
      return;
    }
    if (module.parent) {
      let children = module.parent.children;
      children.splice(children.indexOf(module), 1)
    }
    require.cache[modulePath] = null;
  }


  /**
   * 切换插件方法
   * @param {Plugin}older 旧插件
   * @param {Plugin}newer 新插件
   * @param {boolean?}back=false 为true时,代表本次操作已为回滚操作,不会再次回滚
   */
  toggle(older, newer, back = false) {
    let promise = Promise.resolve();
    let o = older instanceof Plugin;
    let n = newer instanceof Plugin;
    if (o && older.installed) {
      promise = promise.then(() => {
        return older.uninstall().then(() => {
          console.log(`${utils.now()} ${older.id}卸载成功`);
        })
      }).catch(err => {
        older.error = err
        if (n) {
          console.log(`${utils.now()} ${older.id}卸载失败`);
          console.error(err);
        } else {
          console.log(`${utils.now()} ${older.id}卸载失败,删除实例`);
          console.error(err);
        }
      })
      if (n) {
        promise = promise.then(() => {
          console.log(`${utils.now()} ${older.id}数据迁移成功`);
          return newer.upgrade(older);
        }).catch(err => {
          console.log(`${utils.now()} ${older.id}数据迁移失败`);
          console.error(err);
        })
      }
    }
    if (n && !newer.installed && newer.error == null) {
      for (let key of newer.require) {
        let reqPlugin = this.header[key];
        if (reqPlugin == null) {
          promise = promise.then(() => {
            throw `${key} 插件未找到`
          })
          break;
        }
        if (!reqPlugin.installed && reqPlugin.error == null) {
          promise = promise.then(() => this.toggle(null, reqPlugin))
        }
      }
      promise = promise.then(() => {
        return newer.install().then(() => {
          if (o) {
            console.log(`${utils.now()} ${newer.id}更新完成:${older.version} -> ${newer.version}`);
          } else {
            console.log(`${utils.now()} ${newer.id}安装成功`);
          }
          this.header[newer.id] = newer;
        })
      }).catch(err => {
        newer.error = err;
        if (o && !back) {
          console.log(`${utils.now()} ${newer.id}安装失败,回退版本`);
          console.error(err);
          return this.toggle(newer, older, true)
        } else {
          console.log(`${utils.now()} ${newer.id}安装失败,无旧版本`);
          console.error(err);
          return this.toggle(newer, null)
        }
      })
    }
    return promise;
  }

  /**
   * s
   * @param {string}pluginKey
   * @return {(boolean)[]}
   */
  hasInstall(...pluginKey) {
    return pluginKey.map(key => this.header[key].installed)
  }

  /**
   * 在其他脚本中调用 `PluginLoader.cleanCache()` 方法清除 `PluginLoader` 脚本缓存后调用此方法
   * @return {Promise<*>}
   */
  static upgradeSelf() {
    let older = global.PluginLoader;
    let newer = new PluginLoader();
    return newer.toggle(older, newer);
  }
}


module.exports = PluginLoader;