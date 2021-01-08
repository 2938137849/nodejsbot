let Plugin = require("../Plugin");
let CQ = require("../src/CQ");
let {success, fail} = require("../src/utils");

class CQBotPing extends Plugin {
  constructor() {
    super({
      name: "QQ群@复读",
      description: "@复读",
      version: 0.1,
    });
  }

  install() {
    return super.install().then(() => {
      global.bot.on("message.group.@.me", this.ping)
    })
  }

  uninstall() {
    return super.uninstall().then(() => {
      if (global.bot) {
        global.bot.off("message.group.@.me", this.ping)
      }
    })
  }

  ping(event, context, tags) {
    let groupId = context.group_id;
    let messageId = context.message_id;
    let userId = context.sender.user_id;
    /**
     * @type {string}
     */
    let cqTags = tags.filter(tag => tag.tagName === "text").map(tag => tag.text).join("");

    cqTags.replace(/吗/g, "")
    cqTags.replace(/不/g, "很")
    cqTags.replace(/你/g, "我")
    cqTags.replace(/(?<!没)有/g, "没有")

    // stopPropagation方法阻止事件冒泡到父元素
    event.stopPropagation()
    let bot = global.bot;
    bot.send("send_group_msg", {
      group_id: groupId,
      message: [
        CQ.reply(messageId),
        CQ.at(userId),
        CQ.text(cqTags)
      ]
    }).then(success, fail)
  }
}

module.exports = CQBotPing;