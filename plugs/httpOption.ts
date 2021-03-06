import http, {IncomingMessage, ServerResponse} from "http";
import images from "images";
import {Plug} from "../Plug.js";
import {logger} from "../utils/logger.js";
import {axios} from "../utils/Search.js";
import {endlessGen} from "../utils/Util.js";

type ServerHandle = (req: IncomingMessage, res: ServerResponse) => void;

function create(): Map<string, ServerHandle> {
	return new Map<string, ServerHandle>([
		["/exit", (req, res) => {
			res.setHeader("Content-type", "text/html; charset=utf-8");
			res.end("开始退出\n");
			Promise.all([...(Plug.plugs.values())].map((p) => p.uninstall())).then<void>(() => {
				logger.info(">>>>>>>>>> 全部卸载完成 <<<<<<<<<<");
				if (process.execArgv.includes("--inspect")) { return; }
				setTimeout(() => {
					console.log("退出");
					process.exit(0);
				}, 500);
			});
		}],
		["404", (req, res) => {
			res.writeHead(404);
			logger.warn(`${req.url} 404`);
			return res.end("<a href='./exit'>http://127.0.0.1:40000/exit</a>");
		}],
	]);
}

class HttpOption extends Plug {
	public server: Map<string, ServerHandle>;
	private header?: http.Server;
	private generator: Generator<string, never, never>;

	constructor(server: Map<string, ServerHandle>) {
		super(module);
		this.name = "网页指令";
		this.description = "通过网页链接达到控制效果";
		this.version = 0.6;
		this.server = server;
		let jpgUrls = Array.from<undefined, string>({length: 3}, (_, k) => `/${k}.jpg`);
		this.generator = endlessGen(jpgUrls);
	}

	async setJPG(url: string) {
		return axios.get(url).then((data) => {
			let img = images(data.data);
			let width = Math.min(img.size().width >> 1, 1000);
			let buffer = img.resize(width).encode("jpg");
			let value: string = this.generator.next().value;
			this.server.set(value, (req, res) => {
				res.setHeader("Content-type", "image/jpeg");
				res.setHeader("Content-Length", buffer.length);
				res.write(buffer, "binary");
				res.end();
			});
			return `http://127.0.0.1:40000${value}`;
		});
	}

	private handle(req: IncomingMessage, res: ServerResponse) {
		logger.info(`网页 '${req.url}' 收到请求`);
		logger.info(`代理:\t${req.headers["x-forwarded-for"]}`);
		let {remoteFamily: family, remoteAddress: address, remotePort: port} = req.socket;
		logger.info(`远程地址:\t${family} -> ${address} : ${port}`);
		(this.server.get(req.url ?? "") ?? this[404])(req, res);
	}

	async install() {
		let server = http.createServer(
			 this.handle.bind(this),
		).listen(40000, "127.0.0.1");
		logger.info("快速结束已启动,点击 http://127.0.0.1:40000");
		this.header = server;
	}

	async uninstall() {
		this.header?.close();
	}

	private get 404(): ServerHandle {
		return this.server.get("404") ?? ((_, res) => {
			res.writeHead(404);
			res.end();
		});
	}
}

export default new HttpOption(create());