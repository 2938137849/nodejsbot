import {CQ, CQEvent, CQTag} from "go-cqwebsocket";
import {Plug} from "../Plug.js";
import {canCallGroup, canCallPrivate} from "../utils/Annotation.js";
import {logger} from "../utils/logger.js";
import {lolicon, paulzzhTouHou, pixivCat} from "../utils/Search.js";
import {getPRegular, sendAdminQQ, sendForward} from "../utils/Util.js";
import CQData from "./CQData.js";


class CQBotPicture extends Plug {
	public setuSet: Set<string>;


	constructor() {
		super(module);
		this.name = "QQ群聊-图片相关";
		this.description = "QQ群聊发送各种图片";
		this.version = 0;
		this.setuSet = new Set<string>();
	}

	/**获取随机色图*/
	@canCallGroup()
	@canCallPrivate()
	async getSeTu(event: CQEvent<"message.private"> | CQEvent<"message.group">,
		 exec: RegExpExecArray): Promise<CQTag[]> {
		event.stopPropagation();
		let groups = {
			keyword: exec.groups?.keyword,
			r18: exec.groups?.r18 !== undefined,
		};
		let userId: number = event.context.user_id;
		let member = CQData.getMember(userId);
		if (member.exp < 10) { return [CQ.text("不够活跃")]; }
		member.exp -= 10;
		if (this.setuSet.has(groups.keyword ?? "")) {
			return [];
		}
		logger.info("开始色图", groups);
		try {
			let data = await lolicon({
				size1200: true,
				keyword: groups.keyword,
				r18: +groups.r18,
			});
			if (data.code !== 0) {
				let message = CQBotPicture.code(data.code);
				logger.warn(`开始色图异常：异常返回码(${data.code})：${message}`);
				if (data.code === 404) this.setuSet.add(groups.keyword ?? "");
				member.exp += 10;
				return [CQ.text(message)];
			}
			if (data.count < 1) {
				logger.warn(`开始色图异常：色图数量不足(${data.count})`);
				member.exp += 5;
				return [CQ.text("色图数量不足")];
			}
			let first = data.data[0];
			if (event.contextType === "message.group") {
				let {
					message_id: messageId,
					sender: {nickname: nickname},
				} = event.context;
				sendForward(event, [
					CQ.nodeId(messageId),
					CQ.node(nickname, userId, `标题：${first.title}
作者：${first.author}\n原图：www.pixiv.net/i/${first.pid}\np${first.p}`),
					CQ.node(nickname, userId, CQ.escape(first.tags.join("\n"))),
				]).catch(NOP);
			}
			return [CQ.image(getPRegular(first.url))];
		} catch (reason) {
			sendAdminQQ(event, "色图坏了");
			logger.info(reason);
			return [CQ.text("未知错误,或网络错误")];
		}
	}

	/**获取pid对应的p站图片*/
	@canCallGroup()
	@canCallPrivate()
	async getPixiv(event: CQEvent<"message.group"> | CQEvent<"message.private">,
		 exec: RegExpExecArray): Promise<CQTag[]> {
		event.stopPropagation();
		let {pid, p} = (exec.groups as { pid?: string, p?: string }) ?? {};
		logger.debug(`p站图片请求：pid:${pid},p:${p}`);
		if (pid === undefined) {
			return [CQ.text("pid获取失败")];
		}
		let userId: number = event.context.user_id;
		let member = CQData.getMember(userId);
		if (member.exp < 10) { return [CQ.text("不够活跃")]; }
		member.exp -= 10;
		try {
			let data = await pixivCat(pid);
			if (!data.success) {
				logger.info(`请求失败`);
				return [CQ.text(data.error)];
			}
			logger.info(`多张图片:${data.multiple}`);
			if (data.multiple) {
				let urlsProxy = data.original_urls_proxy;
				let length = urlsProxy.length;
				if (p === undefined) {
					let {0: p0, 1: p1} = urlsProxy;
					return [
						CQ.text(`总共${length}张图片,这是第1,2张`),
						CQ.image(getPRegular(p0)),
						CQ.image(getPRegular(p1)),
					];
				} else {
					let ps: number = +p;
					ps = ps >= length ? length - 1 : ps < 1 ? 1 : ps;
					return [
						CQ.text(`总共${length}张图片,这是第${ps},${ps + 1}张`),
						CQ.image(getPRegular(urlsProxy[ps - 1])),
						CQ.image(getPRegular(urlsProxy[ps])),
					];
				}
			} else {
				return [CQ.image(getPRegular(data.original_url_proxy))];
			}
		} catch (e) {
			member.exp += 5;
			sendAdminQQ(event, "p站图片加载出错");
			return [CQ.text("网络请求错误或内部错误")];
		}
	}

	/**随机东方图*/
	@canCallGroup()
	@canCallPrivate()
	async getTouHouPNG(event: CQEvent<"message.group"> | CQEvent<"message.private">): Promise<CQTag[]> {
		console.log("开始东方");
		let userId: number = event.context.user_id;
		let member = CQData.getMember(userId);
		if (member.exp < 10) { return [CQ.text("不够活跃")]; }
		member.exp -= 10;
		try {
			let json = await paulzzhTouHou();
			return [CQ.image((json.url)), CQ.text("作者:" + json.author)];
		} catch (e) {
			member.exp += 5;
			return [CQ.text(`东方图API调用错误`)];
		}
	}

	@canCallGroup()
	@canCallPrivate()
	async getSetuSet(): Promise<CQTag[]> {
		return [CQ.text(["", ...this.setuSet].join("\n"))];
	}

	private static code(code: number) {
		switch (code) {
			case -1  :
				return "内部错误";// 请向 i@loli.best 反馈
			case 0   :
				return "成功";
			case 404 :
				return "找不到符合关键字的色图";
			default:
				return "未知的返回码";
		}
	}
}

export default new CQBotPicture();
