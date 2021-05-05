import {CQ, CQEvent, CQWebSocket, message, messageNode} from "go-cqwebsocket";
import {Status} from "go-cqwebsocket/out/Interfaces";
import {adminGroup, adminId, CQWS} from "../config/config.json";
import {Plug} from "../Plug";
import {db} from "../utils/database";
import {logger} from "../utils/logger";
import {isAtMe, onlyText, sendForward} from "../utils/Util";

type GroFunList = ((this: void, event: CQEvent<"message.group">) => void);
type PriFunList = ((this: void, event: CQEvent<"message.private">) => void);
export = new class CQBot extends Plug {
  public bot: CQWebSocket;
  private readonly grouper: Map<Plug, GroFunList[]>;
  private readonly privater: Map<Plug, PriFunList[]>;
  private readonly helper: Map<string, message>;
  private sendStateInterval?: NodeJS.Timeout;
  
  constructor() {
    super(module, "Bot");
    this.name = "QQ机器人";
    this.description = "用于连接go-cqhttp服务的bot";
    this.version = 0;
    this.bot = new CQWebSocket(CQWS);
    this.bot.bind("on", {
      "socket.error": ({context}) => {
        logger.warn(`连接错误[${context.code}]: ${context.reason}`);
      },
      "socket.open": () => {
        logger.info(`连接开启`);
      },
      "socket.close": ({context}) => {
        logger.info(`已关闭 [${context.code}]: ${context.reason}`);
      },
    });
    this.bot.messageSuccess = (ret, message) => {
      logger.debug(`${message.action}成功：${JSON.stringify(ret.data)}`);
    };
    this.bot.messageFail = (reason, message) => {
      logger.error(`${message.action}失败[${reason.retcode}]:${reason.wording}`);
    };
    this.grouper = new Map();
    this.privater = new Map();
    this.helper = new Map();
    this.bot.bind("on", {
      "message.group": (event) => {
        this.groupMessage(event);
      },
      "message.private": (event) => {
        let values = this.privater.values();
        for (let next = values.next(); !next.done; next = values.next()) {
          for (let fun of next.value) {
            fun(event);
            if (event.isCanceled) return;
          }
        }
        // console.log(contextEvent.isAtMe, event.isCanceled);
        event.stopPropagation();
        this.bot.send_private_msg(event.context.user_id, `收到消息,但未命中处理`).catch(NOP);
        return;
      },
    });
    this.getGroup(this).push(event => {
      if (/^(?:帮助|help)$/.test(onlyText(event))) {
        let tags = <messageNode>[];
        this.helper.forEach((value, key) => {
          tags.push(CQ.node(key, event.context.user_id, value));
        });
        sendForward(event, tags).catch(() => {
          logger.warn("帮助文档发送失败");
        });
      }
    });
  }
  
  setGroupHelper(name: string, node: message): void {
    this.helper.set(name, node);
  }
  
  delGroupHelper(name: string): void {
    this.helper.delete(name);
  }
  
  getGroup(plug: Plug): GroFunList[] {
    let r = this.grouper.get(plug);
    if (r === undefined) {
      r = [];
      this.grouper.set(plug, r);
    }
    return r;
  }
  
  delGroup(plug: Plug): void {
    this.grouper.set(plug, []);
  }
  
  getPrivate(plug: Plug): PriFunList[] {
    let r = this.privater.get(plug);
    if (r === undefined) {
      r = [];
      this.privater.set(plug, r);
    }
    return r;
  }
  
  delPrivate(plug: Plug): void {
    this.privater.set(plug, []);
  }
  
  async install() {
    return new Promise<void>((resolve, reject) => {
      this.bot.bind("onceAll", {
        "socket.open": (event) => {
          logger.info("连接");
          event.bot.send_private_msg(2938137849, "已上线").catch(NOP);
          resolve();
          this.sendStateInterval = setInterval(() => {
            this.sendState(this.bot.state.stat);
          }, 1000 * 60 * 60 * 2);
        },
        "socket.close": () => reject(),
      });
      this.bot.connect();
      process.on("exit", () => {
        this.bot.disconnect();
      });
    });
  }
  
  async uninstall() {
    await this.bot.send_private_msg(adminId, "即将下线").catch(NOP);
    return new Promise<void>((resolve, reject) => {
      this.bot.bind("on", {
        "socket.close": () => {
          logger.info("断开");
          resolve();
        },
        "socket.error": () => {
          logger.info("断开");
          reject();
        },
      });
      this.bot.disconnect();
    });
  }
  
  sendState(state: Status["stat"]) {
    this.bot.send_group_msg(adminGroup, `数据包丢失总数:${state.packet_lost
    }\n接受信息总数:${state.message_received}\n发送信息总数:${state.message_sent}`).catch(() => {
      if (this.sendStateInterval !== undefined) {
        clearInterval(this.sendStateInterval);
      }
    });
  }
  
  private groupMessage(event: CQEvent<"message.group">) {
    db.start(async db => {
      let userId = event.context.user_id;
      let data = await db.get("select id, baned from Members where id = ?;", userId) as { id: number, baned: 0 | 1 };
      if (data === undefined) {
        await db.run("insert into Members(id, exp, time) values (?, 1, ?);", userId, Date.now());
      } else {
        if (data.baned === 1) {
          event.stopPropagation();
        }
        await db.run("update Members set exp=exp + 1, time=? where id = ?;", Date.now(), userId);
      }
      let values = this.grouper.values();
      for (let next = values.next(); !next.done; next = values.next()) {
        for (let fun of next.value) {
          fun(event);
          if (event.isCanceled) return;
        }
      }
      // console.log(contextEvent.isAtMe, event.isCanceled);
      if (!isAtMe(event)) return;
      event.stopPropagation();
      let {
        group_id,
        message_id,
      } = event.context;
      let cqTags = onlyText(event).replace(/吗/g, "")
          .replace(/不/g, "很")
          .replace(/你/g, "我")
          .replace(/(?<!没)有/g, "没有")
          .replace(/[？?]/g, "!");
      await this.bot.send_group_msg(group_id, [
        CQ.reply(message_id),
        CQ.at(userId),
        CQ.text(cqTags),
      ]);
      return;
    }).catch(NOP);
  }
};