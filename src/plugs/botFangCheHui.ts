import {CQ, CQWebSocket} from "go-cqwebsocket";
import {SocketHandle} from "go-cqwebsocket/out/Interfaces";
import Plug from "../Plug";

class CQFangCheHui extends Plug {
  private header?: Partial<SocketHandle>;
  
  constructor() {
    super(module);
    this.name = "QQ群聊-防撤回";
    this.description = "群消息防撤回插件,使用转发api实现";
    this.version = 1;
  }
  
  async install() {
    let def = require("./bot");
    let bot: CQWebSocket = def.bot;
    this.header = bot.bind("on", {
      "notice.group_recall": (event, message) => {
        bot.send_group_forward_msg(message.group_id, [
          CQ.nodeId(message.message_id),
        ]).catch(() => {});
      },
    });
  }
  
  async uninstall() {
    require("./bot").bot.unbind(this.header);
  }
}

export = new CQFangCheHui();