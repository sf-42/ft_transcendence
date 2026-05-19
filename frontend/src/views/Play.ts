import AbstractView from "../utils/AbstractView.ts";
import { setPreviousPage, showHeader } from '../header.ts';
import { toggleBlur } from "../utils/babylonInit.ts";

export default class extends AbstractView {
	constructor() {
		super();
		this.setTitle("Transcendence - Play");
	}

	
	async getHtml(): Promise<string> {
		toggleBlur(false);
		showHeader();
		setPreviousPage("/home");

		const colClass = "rounded-4xl border-8 border-solid border-white p-5 m-2 w-80 md:w-120 bg-black/10 animate-zoomin backdrop-blur-sm \
		transition-colors hover:bg-black/20 transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(0,0,0,0.5)] hover:scale-110";
		const txtClass = "text-center text-5xl md:text-7xl";

		return (`
			<div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-wrap xl:flex-nowrap items-center justify-center">
				<a href="/simplegame" class="nav_link" data-link><div class="${colClass}">
					<h3 class="${txtClass}">Simple game</h3>
				</div></a>
				<a href="/tournament" class="nav_link" data-link><div class="${colClass}">
					<h3 class="${txtClass}">Tournament</h3>
				</div></a>
			</div>
		`);
	}
}
