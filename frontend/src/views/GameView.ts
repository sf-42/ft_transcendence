import AbstractView from "../utils/AbstractView.ts";
import { hideHeader } from "../header.ts";
import { toggleBlur } from "../utils/babylonInit.ts";
import { Game } from "../classes/Game.ts";

export default class extends AbstractView {
	private _game: Game | null = null;

	constructor() {
		super();
		this.setTitle("Transcendence - Game");
	}

	async getHtml(): Promise<string> {
		toggleBlur(false);
		hideHeader();
		// setPreviousPage("/home");

		return (`
			<div id="gameDiv">
			</div>
		`);
	}

	linkGame(game: Game): void {
		this._game = game;
		this._game.renderLoadingScreen();
	}
}
