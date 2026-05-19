import AbstractView from "../utils/AbstractView.ts";
import { player, setCurrentGame, navigateTo } from "../main.ts";
import { setPreviousPage, showHeader } from "../header.ts";
import { moveCamera, toggleBlur } from "../utils/babylonInit.ts";
import { Game } from "../classes/Game.ts";
import { Vector3 } from "@babylonjs/core";

export default class extends AbstractView {
	constructor() {
		super();
		this.setTitle("Transcendence - Simple Game");
	}

	async getHtml(): Promise<string> {
		const btnClass = "rounded-4xl border-8 border-solid border-white p-5 m-2 \
		transition-colors hover:bg-black/20 transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(0,0,0,0.5)] hover:scale-110 \
		text-center text-3xl sm:text-5xl lg:text-7xl cursor-pointer";

		toggleBlur(false);
		showHeader();
		setPreviousPage("/play");

		moveCamera(Math.PI / 2, Math.PI / 2.07, 10, 500, new Vector3(0, 10, -9));
		if (player)
			player.simpleGameScreenAnimation();

		return (`
			<div id="findGameContainer" class="absolute top-1/2 left-1/2 min-w-[70%] sm:min-w-0 transform -translate-x-1/2 -translate-y-1/2 grid grid-cols-1 items-center \
				justify-center rounded-4xl border-8 border-solid border-white p-2 sm:p-5 bg-black/10 animate-zoomin backdrop-blur-sm">
				<button type="button" id="findGame" class="${btnClass}">Find a game</button>
				<label class="flex items-center cursor-pointer space-x-2 mx-auto mt-2">
					<input type="checkbox" id="powerUpsToggle" class="sr-only peer" checked>
					<div class="relative w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full \
						rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] \
						after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border \
						after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600">
					</div>
					<span class="text-3xl lg:text-4xl">Power Ups?</span>
				</label>
			</div>
		`);
	}

	afterRender() {
		const findGame = document.getElementById('findGame');
		if (findGame) {
			findGame.addEventListener('click', () => {
				const powerUpsCheckbox = document.getElementById('powerUpsToggle') as HTMLInputElement;
				const powerUpsActive = powerUpsCheckbox.checked;
				const findGameContainer = document.getElementById('findGameContainer');
				findGameContainer?.classList.add('hidden');
				
				player?.waitAnimationEnd().then(() => {
					if (player) {
						setCurrentGame(new Game(player, powerUpsActive));
						navigateTo("/game");
					}
					else
						console.error("No player set.");
				});
			});
		}
	}
}
