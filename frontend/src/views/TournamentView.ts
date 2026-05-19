import AbstractView from "../utils/AbstractView.ts";
import { navigateTo, player, clientWs } from "../main.ts";
import { hideHeader, setPreviousPage, showHeader } from "../header.ts";
import { toggleBlur } from "../utils/babylonInit.ts";
import { Tournament } from "../classes/Tournament.ts";
import type { TournamentInterface } from "../classes/Tournament.ts";
import { html } from "../utils/html.ts";
import http from "../utils/http.ts";
import { showNotification } from "../utils/ToastifyNotification.ts";
import { getUsernameByID } from "../utils/usersManagement.ts";

export default class extends AbstractView {
	private readonly btnClass = "p-3 text-3xl md:text-4xl rounded-2xl border-solid border-white bg-white/10 transition-colors hover:bg-white/20 w-full \
		transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer";
	private readonly colClass = "relative rounded-4xl border-8 border-solid border-white p-5 m-2 w-full bg-black/10 animate-zoomin backdrop-blur-sm";
	private readonly txtClass = "text-center text-3xl md:text-5xl xl:text-7xl";
	private readonly subTxtClass = "text-center text-xl md:text-2xl lg:text-4xl m-2";

	constructor() {
		super();
		this.setTitle("Transcendence - Tournament");
	}

	async getHtml(): Promise<string> {
		toggleBlur(false);
		showHeader();
		setPreviousPage("/play");

		return (`
			<div class="min-h-screen flex flex-col justify-center items-center p-4">
				<h2 class="text-center text-7xl mt-10 text-shadow-subtitle text-shadow-[#C16630]">Tournaments</h2>
				<div class="w-1/2 flex flex-col gap-4 items-center justify-center">
					<a href="/create-tournament" class="nav_link w-full" data-link>
						<div class="${this.btnClass} border-8 hover:scale-110">
							<p class="${this.txtClass}">Create a tournament</p>
						</div>
					</a>
					<div class="${this.colClass}">
						<p class="${this.txtClass}">Available tournaments</p>
						<div id="tournamentsList">
						</div>
						<button class="${this.btnClass} border-4 my-4 hover:scale-110" id="refresh-list">
							Refresh
						</button>
					</div>
				</div>
			</div>
		`);
	}

	async loadAvalaibleTournaments(): Promise<void> {
		const list = document.getElementById('tournamentsList');

		if (list) {
			list.innerHTML = '';
			list.className = "flex-col items-center justify-center xl:grid xl:grid-cols-2 gap-2";

			const response = await http.get('/matchmaking/tournaments/available', {});
	
			if (!response.data.success) {
				console.error('Failed to fetch tournaments');
				return;
			}
			const result = response.data.tournaments;

			if (result.length === 0) {
				list.classList.remove("xl:grid", "xl:grid-cols-2");
				list.appendChild(html `
					<div class="${this.colClass}">
						<p class="${this.subTxtClass}">No available tournament</p>
					</div>
				`);
				return;
			}

			const availableTournaments: TournamentInterface[] = result;

			for (const tournament of availableTournaments) {
				const powerUps = tournament.powerUps ? 'active' : 'inactive';
				const players: number[] = JSON.parse(tournament.players);
				const creatorUsername = await getUsernameByID(tournament.creator);

				list.appendChild(html `
					<div class="${this.colClass}">
						<div class="flex flex-wrap">
							<p class="${this.subTxtClass}">Creator: ${creatorUsername}</p>
							<p class="${this.subTxtClass}">Players: ${players.length} / ${tournament.maxPlayers}</p>
							<p class="${this.subTxtClass}">Power ups: ${powerUps}</p>
						</div>
						<button class="${this.btnClass} border-4" data-id="${tournament.id}">
							Join
						</button>
					</div>
				`);
			}

			document.querySelectorAll('button[data-id]').forEach((btn) => {
				btn.addEventListener('click', async (e) => {
					if (player && clientWs) {
						const tournamentId = Number((e.currentTarget as HTMLElement).getAttribute('data-id'));

						clientWs.requestTournamentJoin(tournamentId, player.getAccountID());
						try {
							await clientWs.waitTournamentJoin();
							navigateTo("/tournament-overview");
						} catch (error) {
							showNotification('Tournament join timed out', 'error');
						}
					}
					else
						console.error("No player or web socket set.");
				});
			});
		}
		else
			console.error('Failed to get HTMLElement');
	}

	afterRender() {
		this.loadAvalaibleTournaments();

		const refreshBtn = document.getElementById('refresh-list');
		if (refreshBtn) {
			refreshBtn.addEventListener('click', () => {
				this.loadAvalaibleTournaments();
			});
		}
	}
}

export class CreateTournament extends AbstractView {
	constructor() {
		super();
		this.setTitle("Transcendence - Create a tournament");
	}

	async getHtml(): Promise<string> {
		const colClass = "rounded-4xl border-8 border-solid border-white p-2 md:p-5 m-2 bg-black/10 animate-zoomin backdrop-blur-sm";
		const txtClass = "text-center text-4xl md:text-5xl lg:text-7xl m-2";
		const btnClass = colClass + " cursor-pointer w-1/2 transition-colors hover:bg-black/20 transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(0,0,0,0.5)] hover:scale-110 hover:z-50";

		toggleBlur(false);
		showHeader();
		setPreviousPage("/tournament");

		return (`
			<div id="tournamentCreation" class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1/2 flex flex-col gap-4">
				<div class="${colClass} flex">
					<label class="flex items-center cursor-pointer space-x-2 mx-auto mt-2">
						<input type="checkbox" id="powerUpsToggle" class="sr-only peer" checked>
						<div class="relative left-2 md:left-0 w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full \
							rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] \
							after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border \
							after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600">
						</div>
						<span class="${txtClass}">Power Ups?</span>
					</label>
				</div>
				<div class="${colClass}">
					<p class="${txtClass}">How many players do you want in the tournament?</p>
				</div>
				<div class="flex grow w-full">
					<button class="${btnClass}" data-capacity="4">
						<p class="${txtClass}">4</p>
					</button>
					<button class="${btnClass}" data-capacity="8">
						<p class="${txtClass}">8</p>
					</button>
				</div>
			</div>
		`);
	}

	afterRender() {
		document.querySelectorAll('button[data-capacity]').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				const capacity = Number((e.currentTarget as HTMLElement).getAttribute('data-capacity'));
				const powerUpsCheckbox = document.getElementById('powerUpsToggle') as HTMLInputElement;
				const powerUpsActive = powerUpsCheckbox.checked;

				if (player && clientWs) {
					clientWs.requestTournamentCreation(player.getAccountID(), powerUpsActive, capacity);
					try {
						await clientWs.waitTournamentCreation();
						navigateTo("/tournament-overview");
					} catch (error) {
						showNotification('Tournament creation timed out', 'error');
					}
				}
				else
					console.error("No player or web socket set.");
			});
		});
	}
}

export class TournamentOverview extends AbstractView {
	private _tournament: Tournament | null = null;

	constructor() {
		super();
		this.setTitle("Transcendence - Tournament");
	}

	async getHtml(): Promise<string> {
		toggleBlur(false);
		hideHeader();
		setPreviousPage("/tournament");

		return (`
			<div id="tournament">
			</div>
		`);
	}

	afterRender() {
		if (this._tournament) {
			this._tournament.displayActualState();
		}
	}

	linkTournament(tournament: Tournament): void {
		this._tournament = tournament;
		this._tournament.displayActualState();
	}
}
