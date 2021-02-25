import {CQWebSocket} from "go-cqwebsocket";
import {SocketHandle} from "go-cqwebsocket/out/Interfaces";
import {CQTag, text} from "go-cqwebsocket/out/tags";
import Plug from "../Plug";
import RepeatCache from "../utils/repeat";

class BotRepeat extends Plug {
  private header?: SocketHandle;
  
  constructor() {
    super(module);
    this.name = "QQ群聊-复读";
    this.description = "测试用";
    this.version = 0.1;
  }
  
  async install() {
    const repeatCache = new RepeatCache();
    let def = require("./bot");
    let bot: CQWebSocket = def.bot;
    this.header = bot.bind("on", {
      "message.group": (event, context, tags) => {
        let tag: CQTag<text> = tags[0];
        if (tags.length !== 1 || tag.tagName !== "text") {
          return;
        }
        let msg = tag.get("text");
        if (msg.startsWith(".")) {
          return;
        }
        let {
          group_id,
          user_id,
        } = context;
        if (!repeatCache.check(group_id, user_id, msg, 4)) {
          return;
        }
        event.stopPropagation();
        bot.send_group_msg(group_id, tag.toString()).catch(() => {});
      },
    });
  }
  
  async uninstall() {
    let def = require("./bot");
    def._bot?.unbind(this.header);
  }
}

export = new BotRepeat();