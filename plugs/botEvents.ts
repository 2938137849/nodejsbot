import {CQWebSocket} from "go-cqwebsocket";
import {PartialSocketHandle} from "go-cqwebsocket/out/Interfaces";
import {pokeGroup} from "../config/corpus.json";
import {Plug} from "../Plug";
import {db} from "../utils/database";
import {logger} from "../utils/logger";
import {sendAdminQQ} from "../utils/Util";

export = new class CQBotEvents extends Plug {
  private header?: PartialSocketHandle;
  private pokeGroupInner: boolean;
  
  constructor() {
    super(module);
    this.name = "QQ其他-事件";
    this.description = "QQ的各种事件，非群聊";
    this.version = 0.1;
    
    this.header = undefined;
    this.pokeGroupInner = false;
  }
  
  async install() {
    this.header = (<CQWebSocket>require("./bot").bot).bind("on", {
      "notice.notify.poke.group": (event) => {
        if (this.pokeGroupInner) return;
        this.pokeGroupInner = true;
        let target_id = event.context.target_id;
        if (target_id !== event.bot.qq) {return;}
        event.stopPropagation();
        setTimeout(() => {
          db.start(async db => {
            let {user_id, group_id} = event.context;
            let baned = await db.get<{ baned: 0 | 1 }>(`select baned from Members where id=?;`, user_id);
            let str = pokeGroup[Math.random() * pokeGroup.length | 0];
            if (baned?.baned !== 1) {
              event.bot.send_group_msg(group_id, str).catch(NOP).finally(() => {
                this.pokeGroupInner = false;
              });
            }
          });
          logger.log("执行延时结束");
        }, (Math.random() * 5000 | 0) + 5000);
      },
      "notice.group_increase": (event) => {
        event.stopPropagation();
        let {operator_id, user_id, sub_type, group_id} = event.context;
        let str;
        if (operator_id === 0) {
          str = `@${user_id} ${sub_type === "approve" ? "欢迎" : "被邀请"}入群`;
        } else {
          str = `@${user_id} 被管理员{@${operator_id}} ${sub_type === "approve" ? "同意" : "邀请"}入群`;
        }
        event.bot.send_group_msg(group_id, str).catch(() => { });
      },
      "notice.group_decrease": (event) => {
        event.stopPropagation();
        let {sub_type, group_id, user_id, operator_id} = event.context;
        if (sub_type === "kick_me") {
          sendAdminQQ(event, `群 ${group_id} 被踢出`);
          return;
        }
        let str;
        if (sub_type === "kick") {
          str = `@${user_id} 被 管理员{@${operator_id}} 踢出本群`;
        } else {
          str = `@${user_id} 主动离开本群`;
        }
        event.bot.send_group_msg(group_id, str).catch(() => { });
      },
      "request.friend": (event) => {
        event.stopPropagation();
        let {user_id, flag} = event.context;
        sendAdminQQ(event, `${user_id}请求加好友`);
        event.bot.set_friend_add_request(flag, true).catch(NOP);
      },
      "request.group": (event) => {
        event.stopPropagation();
        let {flag, sub_type, group_id} = event.context;
        sendAdminQQ(event, `${group_id}请求入群`);
        event.bot.set_group_add_request(flag, sub_type, true);
      },
    });
  }
  
  async uninstall() {
    require("./bot").bot.unbind(this.header);
  }
}
