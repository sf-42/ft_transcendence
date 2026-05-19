import AbstractView from "../utils/AbstractView.ts";
import { showHeader } from "../header.ts";
import { toggleBlur } from "../utils/babylonInit.ts";

export default class extends AbstractView {
	constructor() {
		super();
		this.setTitle("Transcendence");
	}

	async getHtml(): Promise<string> {
		const buttonClass = "rounded-4xl border-8 border-solid border-white p-5 m-5 w-50 md:w-80 bg-black/10 backdrop-blur-sm transition-colors hover:bg-black/20 \
		transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(0,0,0,0.5)] hover:scale-110 animate-zoomin";

		toggleBlur(false);
		showHeader();

		return (`
			<h1 id="main-title" class="opacity-0 transition-opacity duration-500 text-5xl md:text-6xl lg:text-7xl xl:text-9xl text-gray-50 font-bold text-center text-shadow-title text-shadow-[#C16630]">
				FT_TRANSCENDENCE
			</h1>
			<div class="absolute top-1/2 left-1/4 sm:w-1/2 transform -translate-y-1/2">
				<div class="text-center text-4xl sm:text-5xl md:text-7xl flex flex-col items-center">
					<a href="/play" class="nav__link" data-link><div id="button" class="${buttonClass}"><span>Play</span></div></a>
					<a href="/statistics" class="nav__link" data-link><div id="button" class="${buttonClass}"><span>Statistics</span></div></a>
					<a href="/profile" class="nav__link" data-link><div id="button" class="${buttonClass}"><span>Profile</span></div></a>
					<a href="/settings" class="nav__link" data-link><div id="button" class="${buttonClass}"><span>Settings</span></div></a>
				</div>
			</div>
		`);
	}

	afterRender() {
		const title = document.getElementById('main-title');
		if (title) {
			setTimeout(() => {
				title.classList.replace('opacity-0', 'opacity-100');
			}, 100);
		}
	}
}
